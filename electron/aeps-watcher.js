const { BrowserWindow } = require("electron");

class AepsWatcher {
  constructor() {
    this.window = null;
    this.sourceWindows = new Map();
    this.sourceSessions = new Map();
    this.timer = null;
    this.config = null;
    this.emit = null;
    this.seen = new Set();
    this.polling = false;
    this.liveConfig = null;
    this.liveEmit = null;
    this.liveSeen = new Set();
  }

  isValidSource(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  async start(config, emit) {
    if (!config?.portalId || !config?.sourceUrl) {
      throw new Error("Watcher requires a registered portal and source URL.");
    }
    if (!this.isValidSource(config.sourceUrl)) {
      throw new Error("Watcher source URL must be a valid http/https URL.");
    }

    await this.stop();

    this.config = {
      portalId: String(config.portalId),
      portalName: String(config.portalName || "AEPS Portal"),
      sourceUrl: String(config.sourceUrl),
      intervalSeconds: Math.max(15, Math.min(3600, Number(config.intervalSeconds) || 30)),
    };
    this.emit = typeof emit === "function" ? emit : () => {};

    this.window = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 960,
      minHeight: 640,
      title: "CafeERP — AEPS Watcher · " + this.config.portalName,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: "aeps-watcher-" + this.config.portalId,
      },
    });

    this.window.on("closed", () => {
      const portalId = this.config?.portalId;
      this.window = null;
      this.clearTimer();
      if (portalId) this.emit({ type: "stopped", portalId, reason: "window_closed" });
    });

    this.window.webContents.on("did-finish-load", () => {
      this.emit({
        type: "ready",
        portalId: this.config?.portalId,
        portalName: this.config?.portalName,
        url: this.window?.webContents.getURL(),
      });
    });

    this.window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      this.emit({
        type: "error",
        portalId: this.config?.portalId,
        message: "Portal page failed to load (" + errorCode + "): " + (errorDescription || validatedURL),
      });
    });

    await this.window.loadURL(this.config.sourceUrl);
    this.scheduleNext(0);
    this.emit({
      type: "started",
      portalId: this.config.portalId,
      portalName: this.config.portalName,
      intervalSeconds: this.config.intervalSeconds,
      sourceUrl: this.config.sourceUrl,
      security: "in_memory_session",
    });

    return { started: true };
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  scheduleNext(delayMs) {
    this.clearTimer();
    if (!this.window || this.window.isDestroyed()) return;
    this.timer = setTimeout(() => {
      void this.poll();
    }, Math.max(0, delayMs));
  }

  async poll() {
    if (!this.window || this.window.isDestroyed() || this.polling) return;
    this.polling = true;

    try {
      const result = await this.window.webContents.executeJavaScript(
        "(" + extractVisibleTransactions.toString() + ")()",
        true
      );

      this.emit({
        type: "heartbeat",
        portalId: this.config?.portalId,
        url: this.window.webContents.getURL(),
        checkedAt: new Date().toISOString(),
        found: Array.isArray(result?.transactions) ? result.transactions.length : 0,
        authRequired: Boolean(result?.authRequired),
      });

      if (result?.authRequired) {
        this.emit({
          type: "auth_required",
          portalId: this.config?.portalId,
          message: "Portal authentication is required. Sign in manually in the Watcher window. CafeERP will never enter OTP, PIN, password, or biometric data.",
        });
      }

      for (const transaction of result?.transactions || []) {
        const fingerprint = [
          this.config.portalId,
          transaction.externalTransactionId || transaction.reference || "",
          transaction.amount || "",
          transaction.transactionType || "cash_out",
        ].join("|").toLowerCase();

        if (!transaction.externalTransactionId || !transaction.amount) continue;
        if (this.seen.has(fingerprint)) continue;

        this.seen.add(fingerprint);
        if (this.seen.size > 500) {
          this.seen.delete(this.seen.values().next().value);
        }

        this.emit({
          type: "transaction",
          portalId: this.config.portalId,
          portalName: this.config.portalName,
          fingerprint,
          transaction,
        });
      }

      this.emit({
        type: "success",
        portalId: this.config?.portalId,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.emit({
        type: "error",
        portalId: this.config?.portalId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.polling = false;
      this.scheduleNext((this.config?.intervalSeconds || 30) * 1000);
    }
  }

  async startAll(config, emit) {
    const portalId = String(config?.portalId || "").trim();
    const portalName = String(config?.portalName || "AEPS Portal").trim();
    const sources = Array.isArray(config?.sources) ? config.sources : [];
    const intervalSeconds = Math.max(15, Math.min(3600, Number(config?.intervalSeconds) || 30));

    if (!portalId || sources.length === 0) {
      throw new Error("Live watcher requires a registered portal and at least one source.");
    }

    const validSources = sources.filter((source) => source?.id && source?.url && this.isValidSource(String(source.url)));
    if (validSources.length === 0) {
      throw new Error("No valid enabled watcher source URLs are available.");
    }

    await this.stop();

    this.liveConfig = { portalId, portalName, intervalSeconds };
    this.liveEmit = typeof emit === "function" ? emit : () => {};

    const results = await Promise.allSettled(
      validSources.map((source) => this.startSourceSession(source, portalId, portalName, intervalSeconds))
    );

    const startedSources = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    const failedSources = results.length - startedSources;

    this.liveEmit({
      type: "multi_started",
      portalId,
      portalName,
      sourceCount: validSources.length,
      startedSourceCount: startedSources,
      failedSourceCount: failedSources,
      intervalSeconds,
    });

    if (startedSources === 0) {
      await this.stop();
      throw new Error("Live watcher could not open any configured source.");
    }

    return {
      started: true,
      mode: "multi_source",
      portalId,
      portalName,
      sourceCount: validSources.length,
      startedSourceCount: startedSources,
      failedSourceCount: failedSources,
      intervalSeconds,
    };
  }

  async startSourceSession(source, portalId, portalName, intervalSeconds) {
    const sourceId = String(source.id);
    const sourceUrl = String(source.url);
    const startedAt = Date.now();
    let win = null;

    try {
      const partition = "aeps-watcher-" + portalId;
      win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        title: "CafeERP — AEPS Live Watcher · " + portalName + " · " + (source.purpose || "source"),
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition,
        },
      });

      const session = { win, timer: null, polling: false, source };
      this.sourceSessions.set(sourceId, session);
      this.sourceWindows.set(sourceId, win);

      win.on("closed", () => {
        const current = this.sourceSessions.get(sourceId);
        if (current?.timer) clearTimeout(current.timer);
        this.sourceSessions.delete(sourceId);
        this.sourceWindows.delete(sourceId);
        this.liveEmit?.({
          type: "source_stopped",
          portalId,
          sourceId,
          sourceUrl,
          reason: "window_closed",
        });
      });

      win.webContents.on("did-finish-load", () => {
        this.liveEmit?.({
          type: "source_ready",
          portalId,
          portalName,
          sourceId,
          sourceUrl,
          purpose: source.purpose || "general_updates",
        });
      });

      win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        this.liveEmit?.({
          type: "source_error",
          portalId,
          portalName,
          sourceId,
          sourceUrl,
          error: "Portal page failed to load (" + errorCode + "): " + (errorDescription || validatedURL),
        });
      });

      await win.loadURL(sourceUrl);
      this.scheduleSourcePoll(sourceId, 0);
      this.liveEmit?.({
        type: "source_started",
        portalId,
        portalName,
        sourceId,
        sourceUrl,
        purpose: source.purpose || "general_updates",
        intervalSeconds,
        latencyMs: Date.now() - startedAt,
      });

      return true;
    } catch (error) {
      if (win && !win.isDestroyed()) win.destroy();
      this.sourceSessions.delete(sourceId);
      this.sourceWindows.delete(sourceId);
      this.liveEmit?.({
        type: "source_error",
        portalId,
        portalName,
        sourceId,
        sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  scheduleSourcePoll(sourceId, delayMs) {
    const session = this.sourceSessions.get(String(sourceId));
    if (!session || !this.liveConfig || !session.win || session.win.isDestroyed()) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      void this.pollSource(String(sourceId));
    }, Math.max(0, delayMs));
  }

  async pollSource(sourceId) {
    const session = this.sourceSessions.get(String(sourceId));
    if (!session || !this.liveConfig || !session.win || session.win.isDestroyed() || session.polling) return;
    session.polling = true;

    const source = session.source;
    const portalId = this.liveConfig.portalId;
    const portalName = this.liveConfig.portalName;

    try {
      const result = await session.win.webContents.executeJavaScript(
        "(" + extractVisibleTransactions.toString() + ")()",
        true
      );

      this.liveEmit?.({
        type: "source_heartbeat",
        portalId,
        portalName,
        sourceId,
        sourceUrl: String(source.url),
        checkedAt: new Date().toISOString(),
        found: Array.isArray(result?.transactions) ? result.transactions.length : 0,
        authRequired: Boolean(result?.authRequired),
      });

      if (result?.authRequired) {
        session.win.show();
        this.liveEmit?.({
          type: "source_auth_required",
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          message: "Portal authentication is required. Sign in manually in this watcher window. CafeERP never enters OTP, PIN, password, or biometric data.",
        });
      }

      for (const transaction of result?.transactions || []) {
        const reference = transaction.externalTransactionId || transaction.reference || transaction.externalReference || "";
        const fingerprint = [
          portalId,
          reference,
          transaction.amount || "",
          transaction.transactionType || "cash_out",
        ].join("|").toLowerCase();

        if (!reference || !transaction.amount) continue;
        if (this.liveSeen.has(fingerprint)) continue;
        this.liveSeen.add(fingerprint);

        if (this.liveSeen.size > 2000) {
          this.liveSeen.delete(this.liveSeen.values().next().value);
        }

        this.liveEmit?.({
          type: "transaction",
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          fingerprint,
          transaction,
          detectedAt: new Date().toISOString(),
        });
      }

      this.liveEmit?.({
        type: "source_success",
        portalId,
        portalName,
        sourceId,
        sourceUrl: String(source.url),
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.liveEmit?.({
        type: "source_error",
        portalId,
        portalName,
        sourceId,
        sourceUrl: String(source.url),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      session.polling = false;
      this.scheduleSourcePoll(sourceId, (this.liveConfig?.intervalSeconds || 30) * 1000);
    }
  }

  async collectSources(config) {
    const portalId = String(config?.portalId || "").trim();
    const portalName = String(config?.portalName || "AEPS Portal").trim();
    const sources = Array.isArray(config?.sources) ? config.sources : [];

    if (!portalId || sources.length === 0) {
      return { success: false, portalId, portalName, observations: [], error: "Portal and at least one source are required." };
    }

    const validSources = sources.filter((source) => {
      if (!source?.id || !source?.url) return false;
      return this.isValidSource(String(source.url));
    });

    const results = await Promise.all(
      validSources.map(async (source) => {
        const started = Date.now();
        let win = null;
        let keepOpen = false;

        try {
          const partition = "aeps-watcher-" + portalId;
          win = new BrowserWindow({
            width: 1280,
            height: 860,
            minWidth: 960,
            minHeight: 640,
            title: "CafeERP — AEPS Live Watcher · " + portalName,
            show: false,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              partition,
            },
          });

          this.sourceWindows.set(String(source.id), win);
          await win.loadURL(String(source.url));

          // Give SPAs a chance to render data after the initial document load.
          let rendered = await win.webContents.executeJavaScript(
            "(" + extractRenderedPage.toString() + ")(" + JSON.stringify(5000) + ")",
            true
          );

          const rawText = String(rendered?.text || "").trim();
          const authRequired = Boolean(rendered?.authRequired);

          if (authRequired) {
            keepOpen = true;
            win.show();
          } else if (!rawText) {
            throw new Error("Browser page returned no readable text.");
          }

          return {
            sourceId: String(source.id),
            sourceUrl: String(source.url),
            purpose: source.purpose || "general_updates",
            portalId,
            portalName,
            success: !authRequired,
            authRequired,
            rendered: true,
            httpStatus: 200,
            latencyMs: Date.now() - started,
            content: rawText.slice(0, 12000),
            title: rendered?.title || "",
            error: authRequired
              ? "Portal authentication is required. Sign in manually in the watcher window, then run Verify Live again."
              : null,
          };
        } catch (error) {
          return {
            sourceId: String(source.id),
            sourceUrl: String(source.url),
            purpose: source.purpose || "general_updates",
            portalId,
            portalName,
            success: false,
            authRequired: false,
            rendered: true,
            httpStatus: 0,
            latencyMs: Date.now() - started,
            content: "",
            title: "",
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          if (win && !win.isDestroyed() && !keepOpen) {
            win.destroy();
          }
          if (!keepOpen) this.sourceWindows.delete(String(source.id));
        }
      })
    );

    const succeeded = results.filter((r) => r.success).length;
    return {
      success: succeeded > 0,
      portalId,
      portalName,
      observations: results,
      sourceCount: results.length,
      successfulSourceCount: succeeded,
      failedSourceCount: results.length - succeeded,
    };
  }

  async stop() {
    this.clearTimer();
    this.polling = false;
    const current = this.config?.portalId;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    for (const sourceWindow of this.sourceWindows.values()) {
      if (sourceWindow && !sourceWindow.isDestroyed()) sourceWindow.destroy();
    }
    this.sourceWindows.clear();
    this.sourceSessions.clear();
    this.liveConfig = null;
    this.liveEmit = null;
    this.liveSeen.clear();
    this.window = null;
    this.config = null;
    this.seen.clear();
    if (current) this.emit?.({ type: "stopped", portalId: current, reason: "manual_stop" });
  }
}

async function extractRenderedPage(waitMs = 5000) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const started = Date.now();

  while (Date.now() - started < Number(waitMs || 5000)) {
    const state = await new Promise((resolve) => {
      try {
        const text = document.body?.innerText || "";
        const passwordField = document.querySelector('input[type="password"]:not([hidden])');
        const otpField = document.querySelector('input[name*="otp" i], input[id*="otp" i], input[name*="pin" i], input[id*="pin" i]');
        const loginControl = Array.from(document.querySelectorAll('button, input[type="submit"], a')).some((el) =>
          /(?:sign\s*in|log\s*in|login|authenticate)/i.test(String(el.innerText || el.value || "").trim())
        );
        const shortLoginPage = String(text || "").trim().length < 1500 &&
          /(?:sign\s*in|log\s*in|login|authentication required|enter otp|verification code)/i.test(String(text || ""));
        const authRequired = Boolean(passwordField || otpField || (loginControl && shortLoginPage));
        resolve({ text, authRequired, title: document.title || "" });
      } catch {
        resolve({ text: "", authRequired: false, title: document.title || "" });
      }
    });

    if (state.authRequired || String(state.text || "").trim().length >= 160) {
      return state;
    }
    await sleep(500);
  }

  return {
    text: document.body?.innerText || "",
    authRequired: false,
    title: document.title || "",
  };
}

function extractVisibleTransactions() {
  const clean = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const money = (value) => {
    const match = String(value || "").replace(/,/g, "").match(/(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    return match ? Number(match[1]) : null;
  };
  const normalizeHeader = (value) => clean(value).toLowerCase();
  const findIndex = (headers, patterns) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  const visible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };

  const bodyText = document.body?.innerText || "";
  const authRequired =
    /\b(sign[ -]?in|login|log in|authentication|verification code|otp|one time password)\b/i.test(location.href) ||
    Boolean(document.querySelector('input[type="password"]:not([hidden]), input[name*="otp" i], input[id*="otp" i], input[name*="pin" i], input[id*="pin" i]'));

  const tables = Array.from(document.querySelectorAll("table")).filter(visible);
  const candidates = [];

  for (const table of tables) {
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
    const headerCells = headerRow ? Array.from(headerRow.querySelectorAll("th,td")) : [];
    const headers = headerCells.map((cell) => normalizeHeader(cell.innerText));
    if (!headers.length) continue;

    const rrn = findIndex(headers, [/\brrn\b/, /transaction\s*(id|ref|reference)/, /reference/]);
    const amount = findIndex(headers, [/txn\s*amount/, /transaction\s*amount/, /^amount$/, /withdrawal/]);
    const service = findIndex(headers, [/txn\s*mode/, /transaction\s*mode/, /service/, /product/]);
    const status = findIndex(headers, [/^status$/, /txn\s*status/]);
    const date = findIndex(headers, [/date\s*[&/]?\s*time/, /date.*time/, /^date$/, /time/]);
    const commission = findIndex(headers, [/comm\s*\/\s*charges/, /commission/, /comm/, /charges/]);

    const score =
      (rrn >= 0 ? 4 : 0) +
      (amount >= 0 ? 4 : 0) +
      (service >= 0 ? 3 : 0);

    if (score < 8) continue;

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(visible);
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(":scope > td")).map((cell) => clean(cell.innerText));
      if (!cells.length) continue;

      const full = cells.join(" | ");
      const serviceText = service >= 0 ? cells[service] || "" : "";
      const isCashOut =
        /aeps.*cash\s*withdrawal|cash\s*withdrawal.*aeps|cash\s*out|withdrawal/i.test(serviceText + " " + full) &&
        /aeps|aadhaar/i.test(serviceText + " " + full);
      const isPaymentCollection =
        /payment\s*collection|cash\s*collection|customer\s*payment|aadhaar\s*pay/i.test(serviceText + " " + full) &&
        /aeps|aadhaar/i.test(serviceText + " " + full);

      if (!isCashOut && !isPaymentCollection) continue;

      const parsedAmount = amount >= 0 ? money(cells[amount]) : money(full);
      const reference = rrn >= 0 ? cells[rrn] : "";
      if (!parsedAmount || parsedAmount <= 0 || !/\d{8,}/.test(reference)) continue;

      const statusText = status >= 0 ? cells[status] || "" : full;
      if (/failed|rejected|declined|cancelled|reversed|refunded/i.test(statusText)) continue;

      const mobile = full.match(/(?:Mobile|Mob|Phone|Contact)\s*[:#=-]?\s*([6-9]\d{9})/i)?.[1] || "";
      const aadhaar = full.match(/(?:Aadhaar|Aadhar|Customer\s*(?:ID|No|Number))\s*[:#=-]?\s*(?:[xX*#\s-]*)(\d{4})\b/i)?.[1] || "";
      const bank =
        full.match(/(?:Bank\s*Name|Customer\s*Bank|Beneficiary\s*Bank)\s*[:#=-]?\s*([A-Za-z][A-Za-z ]{2,40})/i)?.[1]?.trim() ||
        full.match(/\b(SBI|HDFC|ICICI|Axis|PNB|Canara|Kotak|Union Bank|Bank of Baroda|Indian Bank)\b/i)?.[1] ||
        "";
      const occurredAt = date >= 0 ? cells[date] || "" : "";

      candidates.push({
        externalTransactionId: reference,
        externalReference: reference,
        status: "success",
        transactionType: isPaymentCollection ? "payment_collection" : "cash_out",
        amount: parsedAmount.toFixed(2),
        fee: null,
        commission: commission >= 0 ? String(money(cells[commission]) || 0) : "0",
        occurredAt,
        customerName: "",
        customerMobile: mobile,
        aadhaarLast4: aadhaar,
        bankName: bank,
        rawText: full,
      });
    }
  }

  return { authRequired, transactions: candidates.slice(0, 25) };
}

module.exports = { AepsWatcher };
