const { BrowserWindow } = require("electron");
const { AepsTransactionJourneyMemory } = require("./aeps-transaction-session");

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
    this.journeyMemory = new AepsTransactionJourneyMemory();
    this.journeyFinalEmitted = new Set();
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
    this.journeyMemory = new AepsTransactionJourneyMemory();
    this.journeyFinalEmitted.clear();

    // Sources from the same website must authenticate through ONE browser
    // session before we fan out to the other URLs. Starting every URL in
    // parallel can make every window see the login page at the same time,
    // causing repeated login/OTP prompts even though all windows share the
    // same Electron partition.
    //
    // Different websites are still isolated and can start independently.
    const groups = new Map();
    for (const source of validSources) {
      const key = getSiteKey(String(source.url));
      const group = groups.get(key) || [];
      group.push(source);
      groups.set(key, group);
    }

    // Different websites may start concurrently, but URLs belonging to the
    // same website are opened one-by-one. This keeps one authentication flow
    // per website while preserving multi-site concurrency.
    const groupResults = await Promise.allSettled(
      Array.from(groups.values()).map(async (group) => {
        const siteResults = [];
        for (const source of group) {
          const started = await this.startSourceSession(
            source,
            portalId,
            portalName,
            intervalSeconds,
            { waitForAuthentication: true }
          );
          siteResults.push({ status: started ? "fulfilled" : "rejected", value: started });
        }
        return siteResults;
      })
    );

    const results = groupResults.flatMap((groupResult) =>
      groupResult.status === "fulfilled" ? groupResult.value : []
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

  async startSourceSession(source, portalId, portalName, intervalSeconds, options = {}) {
    const waitForAuthentication = Boolean(options.waitForAuthentication);
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

      // Detect authenticated-session requirements immediately after navigation.
      // Some portals render a login form without a /login URL, so URL checks
      // alone are insufficient. The same browser partition is retained so the
      // operator's manual login is reused by every source for the portal.
      const pageState = await win.webContents.executeJavaScript(
        "(" + extractRenderedPage.toString() + ")(" + JSON.stringify(1500) + ")",
        true
      );
      if (pageState?.authRequired) {
        win.show();
        this.liveEmit?.({
          type: "source_auth_required",
          portalId,
          portalName,
          sourceId,
          sourceUrl,
          message: "Authentication required. Sign in manually in this watcher window. After one successful login, CafeERP will reuse the same session for the other URLs on this website.",
        });

        if (waitForAuthentication) {
          this.liveEmit?.({
            type: "source_auth_waiting",
            portalId,
            portalName,
            sourceId,
            sourceUrl,
            message: "Waiting for the manual login to complete before opening the other URLs for this website.",
          });

          const authenticated = await waitForAuthenticationCompletion(win, 300000);
          if (!authenticated) {
            throw new Error(
              "Login was not completed within 5 minutes. Other URLs for this website were not opened to avoid repeated login attempts."
            );
          }

          // Ensure cookies created by the manual login are committed before
          // the next source navigates with the same portal partition.
          try {
            await win.webContents.session.cookies.flushStore();
          } catch {
            // Some Electron builds do not expose cookie flushing reliably;
            // the shared session remains valid and navigation can continue.
          }

          this.liveEmit?.({
            type: "source_auth_resolved",
            portalId,
            portalName,
            sourceId,
            sourceUrl,
            message: "Login detected. Reusing this authenticated session for the remaining website URLs.",
          });
        }
      }

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
      let result = await session.win.webContents.executeJavaScript(
        "(" + extractVisibleTransactions.toString() + ")()",
        true
      );

      // Transaction/report pages are often client-rendered and do not refresh
      // their DOM until the portal's refresh control is pressed. If the first
      // scan finds nothing, refresh the authenticated view once and scan again.
      // We never refresh while an authentication form is visible.
      if (
        source?.purpose === "transaction_info" &&
        !result?.authRequired &&
        (!Array.isArray(result?.transactions) || result.transactions.length === 0)
      ) {
        const refreshResult = await refreshTransactionView(session.win);
        if (refreshResult?.refreshed) {
          if (refreshResult?.reloaded) {
            await waitForPageLoad(session.win, 8000);
            // A successful document load does not mean a React/Angular report
            // has finished rendering its rows. Give the authenticated page a
            // short settle window before extracting transactions.
            await session.win.webContents.executeJavaScript(
              "(" + extractRenderedPage.toString() + ")(2500)",
              true
            );
          } else {
            await new Promise((resolve) => setTimeout(resolve, 2200));
          }

          result = await session.win.webContents.executeJavaScript(
            "(" + extractVisibleTransactions.toString() + ")()",
            true
          );
        }
      }

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
          message: "Portal authentication is required. Sign in manually in the watcher window. CafeERP never enters OTP, PIN, password, or biometric data.",
        });
      }

      // Transaction journey capture: remember safe fields from the
      // beginning of data entry, then correlate the final result and passbook.
      // Authentication secrets are never read or stored.
      const journeyPage = await session.win.webContents.executeJavaScript(
        "(" + extractTransactionJourneySnapshot.toString() + ")()",
        true
      );

      const journeySnapshots = [];

      if (journeyPage?.shouldRemember && journeyPage?.fields) {
        const snapshot = this.journeyMemory.record({
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          stage: journeyPage.stage || "intermediate",
          fields: journeyPage.fields,
          capturedAt: new Date().toISOString(),
          evidence: journeyPage.evidence || "",
        });
        if (snapshot) journeySnapshots.push(snapshot);
      }

      for (const transaction of result?.transactions || []) {
        const stage = journeyPage?.stage === "passbook" ? "passbook" : "final";
        const snapshot = this.journeyMemory.record({
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          stage,
          fields: transaction,
          capturedAt: new Date().toISOString(),
          evidence: stage === "passbook"
            ? "Passbook/statement transaction observed."
            : "Final AEPS transaction result observed.",
        });

        if (!snapshot) continue;
        journeySnapshots.push(snapshot);

        this.liveEmit?.({
          type: "transaction_journey",
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          sessionId: snapshot.id,
          stage,
          status: snapshot.status,
          stageSummary: snapshot.stageSummary,
          fields: snapshot.fields,
          observationCount: snapshot.observationCount,
          detectedAt: new Date().toISOString(),
        });

        const reference =
          snapshot.fields.reference ||
          transaction.externalTransactionId ||
          transaction.reference ||
          transaction.externalReference ||
          "";

        const fingerprint = [
          portalId,
          reference,
          snapshot.fields.amount || transaction.amount || "",
          snapshot.fields.transactionType || transaction.transactionType || "cash_out",
        ].join("|").toLowerCase();

        if (snapshot.status === "FINAL_CONFIRMED" || snapshot.status === "RECONCILED") {
          if (!this.journeyFinalEmitted.has(snapshot.id)) {
            this.journeyFinalEmitted.add(snapshot.id);
            this.liveEmit?.({
              type: "transaction",
              portalId,
              portalName,
              sourceId,
              sourceUrl: String(source.url),
              sessionId: snapshot.id,
              fingerprint,
              journeyStatus: snapshot.status,
              passbookMatched: Boolean(snapshot.stageSummary?.passbook),
              verification: snapshot.verification,
              transaction: {
                ...transaction,
                ...snapshot.fields,
                externalTransactionId: snapshot.fields.reference || transaction.externalTransactionId || "",
                externalReference: snapshot.fields.reference || transaction.externalReference || "",
                reference: snapshot.fields.reference || transaction.reference || "",
                status: snapshot.fields.status || "success",
                amount: snapshot.fields.amount ?? transaction.amount,
                customerMobile: snapshot.fields.customerMobile || transaction.customerMobile || "",
                aadhaarLast4: snapshot.fields.aadhaarLast4 || transaction.aadhaarLast4 || "",
                customerName: snapshot.fields.customerName || transaction.customerName || "",
                bankName: snapshot.fields.bankName || transaction.bankName || "",
                transactionType: snapshot.fields.transactionType || transaction.transactionType || "cash_out",
                fee: snapshot.fields.fee ?? transaction.fee ?? null,
                commission: snapshot.fields.commission ?? transaction.commission ?? "0",
              },
              detectedAt: new Date().toISOString(),
            });
          }
        }

        if (snapshot.status === "RECONCILED" && snapshot.stageSummary?.passbook) {
          this.liveEmit?.({
            type: "transaction_reconciled",
            portalId,
            portalName,
            sourceId,
            sourceUrl: String(source.url),
            sessionId: snapshot.id,
            fingerprint,
            verification: snapshot.verification,
            fields: snapshot.fields,
            reconciledAt: new Date().toISOString(),
          });
        } else if (snapshot.status === "CONFLICT") {
          this.liveEmit?.({
            type: "transaction_conflict",
            portalId,
            portalName,
            sourceId,
            sourceUrl: String(source.url),
            sessionId: snapshot.id,
            fingerprint,
            verification: snapshot.verification,
            fields: snapshot.fields,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // Keep the old de-duplication set for compatibility with existing
      // diagnostics and contracts. The journey session id is the authoritative
      // transaction correlation key for new detections.

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

  async snapshotLiveSources(config = {}) {
    const requestedPortalId = String(config?.portalId || this.liveConfig?.portalId || "").trim();
    if (!requestedPortalId || !this.liveConfig || requestedPortalId !== this.liveConfig.portalId) {
      return { success: false, portalId: requestedPortalId, observations: [], error: "Live watcher is not running for the requested portal." };
    }

    const sessions = Array.from(this.sourceSessions.entries());
    if (sessions.length === 0) {
      return { success: false, portalId: requestedPortalId, observations: [], error: "No live watcher source sessions are running." };
    }

    const results = await Promise.all(
      sessions.map(async ([sourceId, session]) => {
        const started = Date.now();
        try {
          if (!session.win || session.win.isDestroyed()) {
            throw new Error("Source browser window is unavailable.");
          }

          const rendered = await session.win.webContents.executeJavaScript(
            "(" + extractRenderedPage.toString() + ")(" + JSON.stringify(1200) + ")",
            true
          );
          const content = String(rendered?.text || "").trim();
          const authRequired = Boolean(rendered?.authRequired);

          if (authRequired) session.win.show();

          return {
            sourceId,
            sourceUrl: String(session.source.url),
            purpose: session.source.purpose || "general_updates",
            portalId: requestedPortalId,
            portalName: this.liveConfig.portalName,
            success: !authRequired && content.length > 0,
            authRequired,
            rendered: true,
            httpStatus: 200,
            latencyMs: Date.now() - started,
            content: content.slice(0, 12000),
            title: String(rendered?.title || ""),
            error: authRequired
              ? "Portal authentication is required. Sign in manually in the watcher window."
              : content.length > 0
              ? null
              : "Source returned no readable content.",
          };
        } catch (error) {
          return {
            sourceId,
            sourceUrl: String(session.source.url),
            purpose: session.source.purpose || "general_updates",
            portalId: requestedPortalId,
            portalName: this.liveConfig.portalName,
            success: false,
            authRequired: false,
            rendered: true,
            httpStatus: 0,
            latencyMs: Date.now() - started,
            content: "",
            title: "",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return {
      success: results.some((r) => r.success),
      portalId: requestedPortalId,
      portalName: this.liveConfig.portalName,
      observations: results,
      sourceCount: results.length,
      successfulSourceCount: results.filter((r) => r.success).length,
      failedSourceCount: results.filter((r) => !r.success).length,
    };
  }

  async collectSources(config) {
    const portalId = String(config?.portalId || "").trim();

    // When the persistent watcher is already running for this portal, reuse
    // those authenticated browser sessions instead of opening a second set of
    // windows and losing the operator's current login context.
    if (
      portalId &&
      this.liveConfig?.portalId === portalId &&
      this.sourceSessions.size > 0
    ) {
      return this.snapshotLiveSources({ portalId });
    }
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

  getStatus() {
    const sessions = Array.from(this.sourceSessions.entries()).map(([sourceId, session]) => ({
      sourceId,
      url: String(session?.source?.url || ""),
      purpose: session?.source?.purpose || "general_updates",
      destroyed: Boolean(!session?.win || session.win.isDestroyed()),
      polling: Boolean(session?.polling),
    }));

    return {
      active: Boolean(this.liveConfig && this.sourceSessions.size > 0),
      portalId: this.liveConfig?.portalId || null,
      portalName: this.liveConfig?.portalName || null,
      intervalSeconds: this.liveConfig?.intervalSeconds || null,
      sourceCount: sessions.length,
      sessions,
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
    this.journeyMemory = new AepsTransactionJourneyMemory();
    this.journeyFinalEmitted.clear();
    this.window = null;
    this.config = null;
    this.seen.clear();
    if (current) this.emit?.({ type: "stopped", portalId: current, reason: "manual_stop" });
  }
}

function getSiteKey(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.trim().toLowerCase().replace(/^www\./, "");
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length <= 2) return labels.join(".");

    // Treat common multi-part public suffixes such as co.in/com.au as part
    // of the suffix so portal.example.co.in groups as example.co.in rather
    // than incorrectly grouping every *.co.in website together.
    const secondLast = labels[labels.length - 2];
    const last = labels[labels.length - 1];
    const multipartSuffixes = new Set([
      "co.in", "com.au", "co.uk", "co.nz", "co.za", "com.sg", "com.my",
      "com.bd", "com.pk", "org.in", "net.in", "gov.in", "ac.in"
    ]);

    if (multipartSuffixes.has(secondLast + "." + last) && labels.length >= 3) {
      return labels.slice(-3).join(".");
    }

    return labels.slice(-2).join(".");
  } catch {
    return String(rawUrl || "").trim().toLowerCase();
  }
}

async function waitForAuthenticationCompletion(win, timeoutMs = 300000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (!win || win.isDestroyed()) return false;

    try {
      const state = await win.webContents.executeJavaScript(
        "(" + extractRenderedPage.toString() + ")(1000)",
        true
      );

      // Require two consecutive non-authenticated checks. This prevents a
      // transient redirect/rendering gap from being mistaken for a completed
      // login before the portal has actually established the session.
      if (state && !state.authRequired && String(state.text || "").trim().length >= 160) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!win || win.isDestroyed()) return false;
        try {
          const confirmed = await win.webContents.executeJavaScript(
            "(" + extractRenderedPage.toString() + ")(1000)",
            true
          );
          if (confirmed && !confirmed.authRequired && String(confirmed.text || "").trim().length >= 160) {
            return true;
          }
        } catch {
          // Keep waiting for a stable authenticated page.
        }
      }
    } catch {
      // Navigation can briefly invalidate the execution context. Keep polling
      // until the timeout rather than opening another login window.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

async function waitForPageLoad(win, timeoutMs = 8000) {
  if (!win || win.isDestroyed()) return false;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        win.webContents.removeListener("did-finish-load", onLoad);
      } catch {}
      resolve(value);
    };
    const onLoad = () => finish(true);
    const timer = setTimeout(() => finish(false), Math.max(1000, timeoutMs));

    try {
      win.webContents.once("did-finish-load", onLoad);
    } catch {
      finish(false);
    }
  });
}

async function refreshTransactionView(win) {
  if (!win || win.isDestroyed()) return { refreshed: false, reloaded: false };

  try {
    const clicked = await win.webContents.executeJavaScript(
      `(() => {
        const visible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0;
        };

        const controls = Array.from(
          document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']")
        ).filter(visible);

        const refresh = controls.find((el) =>
          /^(refresh|reload|refresh data|reload data|sync|full sync|fullsync|refresh list|refresh report|sync passbook|full sync passbook)$/i.test(
            String(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim()
          )
        );

        if (!refresh) return false;
        try {
          refresh.click();
          return true;
        } catch {
          return false;
        }
      })()`,
      true
    );

    if (clicked) {
      return { refreshed: true, reloaded: false };
    }

    // No safe refresh control was found. Prepare the load listener BEFORE
    // calling reload so a fast cached navigation cannot race past the listener.
    // Electron's persistent partition retains portal cookies/session state.
    const loadPromise = waitForPageLoad(win, 8000);
    await win.webContents.reload();
    await loadPromise;
    return { refreshed: true, reloaded: true };
  } catch {
    return { refreshed: false, reloaded: false };
  }
}

function extractRenderedAuthSignals(text, url) {
  const pageText = String(text || "");
  const href = String(url || "");

  const visibleCredentialForm =
    /(?:password|passcode|pin|otp|one[- ]time password|verification code)/i.test(pageText) &&
    /(?:sign[ -]?in|log[ -]?in|login|authenticate|continue)/i.test(pageText);

  // DigiPay/CSC biometric login commonly presents no password field at all.
  // Its pre-auth page instead asks for a CSC ID, Aadhaar biometrics, and a
  // Scan/Login action. Treat that combination as a real auth barrier.
  const cscBiometricLogin =
    /(?:valid[ \t]+CSC[ \t]+ID|CSC[ \t]+ID)/i.test(pageText) &&
    /biometric|biometrics/i.test(pageText) &&
    /(?:scan|login)/i.test(pageText) &&
    (document.querySelector('input[name*="csc" i], input[id*="csc" i], input[placeholder*="csc" i]') != null ||
      Array.from(document.querySelectorAll("button, [role='button'], input[type='submit'], a")).some((el) =>
        /(?:scan|login)/i.test(String(el.innerText || el.value || el.getAttribute("aria-label") || "").trim())
      ));

  const biometricLogin =
    /(?:aadhaar|aadhar).{0,80}(?:biometric|authentication)/is.test(pageText) &&
    /(?:scan|authenticate|login|sign[ -]?in)/i.test(pageText);

  const explicitLogin =
    /(?:agents+login|retailers+login|authentications+required|enters+otp|verifications+code)/i.test(pageText) &&
    /(?:login|sign[ -]?in|authenticate)/i.test(pageText);

  const urlLogin = /\/(?:login|signin|sign-in|authenticate)(?:\/|\?|$)/i.test(href);

  return Boolean(visibleCredentialForm || cscBiometricLogin || biometricLogin || explicitLogin || urlLogin);
}

async function extractRenderedPage(waitMs = 5000) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const started = Date.now();

  while (Date.now() - started < Number(waitMs || 5000)) {
    const state = await new Promise((resolve) => {
      try {
        const text = document.body?.innerText || "";
        const title = document.title || "";
        const visibleField = (selector) =>
          Array.from(document.querySelectorAll(selector)).some((el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          });

        const passwordField = visibleField('input[type="password"]:not([hidden])');
        const otpField = visibleField(
          'input[name*="otp" i], input[id*="otp" i], input[name*="pin" i], input[id*="pin" i]'
        );
        const credentialField = visibleField(
          'input[name*="user" i], input[id*="user" i], input[name*="login" i], input[id*="login" i], input[type="email"]'
        );

        const pageAuthRequired = extractRenderedAuthSignals(text, location.href);
        const formAuthRequired =
          (passwordField || otpField || credentialField) &&
          Array.from(document.querySelectorAll("button, input[type='submit'], [role='button'], a")).some((el) =>
            /(?:sign\s*in|log\s*in|login|authenticate|agent\s+login|retailer\s+login|scan)/i.test(
              String(el.innerText || el.value || el.getAttribute("aria-label") || "").trim()
            )
          );

        resolve({
          text,
          authRequired: Boolean(pageAuthRequired || formAuthRequired),
          title,
        });
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
    authRequired: extractRenderedAuthSignals(document.body?.innerText || "", location.href),
    title: document.title || "",
  };
}

function extractTransactionJourneySnapshot() {
  const clean = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const visible = (el) => {
    try {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    } catch {
      return false;
    }
  };

  const textOf = (el) => clean(el?.innerText || el?.textContent || el?.value || "");
  const bodyText = clean(document.body?.innerText || "");
  const title = clean(document.title || "");
  const url = clean(location.href || "");

  const isSecretControl = (el) => {
    const type = String(el?.type || "").toLowerCase();
    const meta = [
      el?.name,
      el?.id,
      el?.placeholder,
      el?.getAttribute?.("aria-label"),
      el?.getAttribute?.("autocomplete"),
    ].map(clean).join(" ").toLowerCase();
    return type === "password" || /otp|one[- ]time|pin|password|passcode|biometric|fingerprint/.test(meta);
  };

  const controls = Array.from(document.querySelectorAll("input, select, textarea"))
    .filter(visible)
    .filter((el) => !isSecretControl(el));

  const fieldValue = (patterns) => {
    const control = controls.find((el) => {
      const meta = [
        el?.name,
        el?.id,
        el?.placeholder,
        el?.getAttribute?.("aria-label"),
        el?.getAttribute?.("title"),
      ].map(clean).join(" ").toLowerCase();
      return patterns.some((pattern) => pattern.test(meta));
    });
    return control ? clean(control.value || textOf(control)) : "";
  };

  const firstMatch = (patterns, source = bodyText) => {
    for (const pattern of patterns) {
      const match = String(source || "").match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
    return "";
  };

  const money = (value) => {
    const raw = clean(value).replace(/,/g, "");
    const match =
      raw.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
      raw.match(/^([0-9]+(?:\.[0-9]{1,2})?)$/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
  };

  const mobile =
    fieldValue([/mobile/, /phone/, /contact/]).match(/[6-9]\d{9}/)?.[0] ||
    firstMatch([/(?:mobile|mob|phone|contact)\s*[:#=\-]?\s*([6-9]\d{9})/i]);

  const aadhaar =
    fieldValue([/aadhaar/, /aadhar/]).replace(/\D/g, "").slice(-4) ||
    firstMatch([/(?:aadhaar|aadhar)\s*(?:last\s*4|number|no\.?|id)?\s*[:#=\-]?\s*[xX*#\s-]*(\d{4})\b/i]);

  const customerName =
    fieldValue([/customer\s*name/, /^name$/]) ||
    firstMatch([/(?:customer\s*name|customer|name)\s*[:#=\-]\s*([A-Za-z][A-Za-z .'-]{2,80})/i]);

  const bankName =
    fieldValue([/bank\s*name/, /customer\s*bank/, /issuer\s*bank/, /^bank$/]) ||
    firstMatch([
      /(?:issuer\s*bank|customer\s*bank|beneficiary\s*bank|bank\s*name)\s*[:#=\-]\s*([A-Za-z][A-Za-z .&'-]{2,60})/i,
      /\b(SBI|HDFC|ICICI|Axis|PNB|Canara|Kotak|Union\s+Bank|Bank\s+of\s+Baroda|Indian\s+Bank)\b/i,
    ]);

  const rawAmount =
    fieldValue([/transaction\s*amount/, /withdrawal\s*amount/, /amount/, /amt/]) ||
    firstMatch([
      /(?:transaction\s*amount|txn\s*amount|withdrawal\s*amount|cash\s*withdrawal|amount\s*paid|paid\s*amount|amount|amt)\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    ]);
  const amount = money(rawAmount);

  const reference =
    fieldValue([/^rrn$/, /rrn/, /utr/, /transaction\s*(id|no|number|ref|reference)/, /reference/]) ||
    firstMatch([
      /\b(?:RRN|UTR|reference(?:\s*(?:id|no|number))?|transaction\s*(?:id|no|number|ref|reference)|txn\s*(?:id|no|number|ref|reference))\s*[:#=\-]?\s*([A-Za-z0-9][A-Za-z0-9._\/-]{5,31})/i,
    ]);

  const transactionTypeRaw =
    fieldValue([/transaction\s*(type|mode)/, /service/, /product/, /operation/]) ||
    firstMatch([
      /(?:transaction\s*(?:type|mode)|service|product|operation)\s*[:#=\-]\s*([^|]+)/i,
    ]);

  const transactionType = (() => {
    const s = clean(transactionTypeRaw + " " + bodyText).toLowerCase().replace(/[-_]/g, " ");
    if (/payment\s*collection|cash\s*collection|aadhaar\s*pay|merchant\s*pay/.test(s)) return "payment_collection";
    if (/balance\s*(enquiry|inquiry)/.test(s)) return "balance_enquiry";
    if (/mini\s*statement/.test(s)) return "mini_statement";
    if (/cash\s*(withdrawal|out)|withdrawal|cashout|biometric\s*withdrawal/.test(s)) return "cash_out";
    return "";
  })();

  const statusRaw =
    fieldValue([/^status$/, /transaction\s*status/, /txn\s*status/]) ||
    firstMatch([
      /(?:transaction\s*status|txn\s*status|status)\s*[:#=\-]\s*([^|]+)/i,
    ]) ||
    bodyText;
  const status = /failed|rejected|declined|cancelled|reversed|refunded/i.test(statusRaw)
    ? "failed"
    : /pending|processing|initiated|in progress/i.test(statusRaw)
    ? "pending"
    : /success|successful|completed|approved|confirmed/i.test(statusRaw)
    ? "success"
    : "";

  const fee = money(
    fieldValue([/customer\s*fee/, /^fee$/, /charge/, /surcharge/]) ||
      firstMatch([/(?:customer\s*)?(?:fee|charge|surcharge)\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i])
  );

  const commission = money(
    fieldValue([/commission/, /comm/]) ||
      firstMatch([/(?:portal\s*)?commission\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i])
  );

  const isPassbook =
    /passbook|statement|transaction\s*history|transaction\s*report|history|mini\s*statement/i.test(
      [url, title, bodyText.slice(0, 12000)].join(" ")
    );
  const hasFinalSignal =
    Boolean(reference && amount != null) &&
    /success|successful|completed|approved|confirmed|transaction\s*successful/i.test(
      [title, bodyText.slice(0, 12000)].join(" ")
    );
  const hasEntrySignals =
    controls.length > 0 &&
    Boolean(mobile || aadhaar || amount != null || bankName || transactionTypeRaw);

  const stage = isPassbook
    ? "passbook"
    : hasFinalSignal
    ? "final"
    : hasEntrySignals
    ? "entry"
    : (mobile || aadhaar || amount != null || bankName || transactionTypeRaw)
    ? "intermediate"
    : "unknown";

  const safeFieldCount = [customerName, mobile, aadhaar, bankName, transactionType, amount, fee, commission, reference, status]
    .filter((value) => value !== "" && value !== null && value !== undefined).length;

  if (stage === "unknown" || safeFieldCount < 2) {
    return {
      shouldRemember: false,
      stage: "unknown",
      fields: {},
      evidence: "",
    };
  }

  return {
    shouldRemember: true,
    stage,
    fields: {
      customerName,
      customerMobile: mobile,
      aadhaarLast4: aadhaar,
      bankName,
      transactionType,
      amount,
      fee,
      commission,
      reference,
      status,
    },
    evidence: [
      "stage=" + stage,
      isPassbook ? "passbook-view=true" : "passbook-view=false",
      hasFinalSignal ? "final-signal=true" : "final-signal=false",
      "source=" + url.slice(0, 240),
    ].join("; "),
  };
}

function extractVisibleTransactions() {
  const clean = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const visible = (element) => {
    try {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    } catch {
      return false;
    }
  };

  const money = (value) => {
    const raw = clean(value).replace(/,/g, "");
    const currency =
      raw.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
      raw.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/);
    if (!currency) return null;
    const n = Number(currency[1]);
    return Number.isFinite(n) ? n : null;
  };

  const findNumberAfterLabel = (text, patterns) => {
    const cleanText = clean(text);
    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match?.[1]) {
        const n = money(match[1]);
        if (n != null) return n;
      }
    }
    return null;
  };

  const firstMatch = (text, patterns) => {
    const value = String(text || "");
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
    return "";
  };

  const parseCandidate = (rawText, options = {}) => {
    const full = clean(rawText);
    if (!full || full.length < 8) return null;

    const headers = Array.isArray(options.headers) ? options.headers : [];
    const cells = Array.isArray(options.cells) ? options.cells : [];
    const pageContext = clean(options.pageContext || "");
    const serviceText = clean(options.serviceText || "");
    const context = clean(full + " " + pageContext);

    const referenceFromLabel = firstMatch(full, [
      /\b(?:RRN|UTR|reference(?:\s*(?:id|no|number))?|transaction\s*(?:id|no|number|ref|reference)|txn\s*(?:id|no|number|ref|reference))\s*[:#=\-]?\s*([A-Za-z0-9][A-Za-z0-9._\/-]{5,31})/i,
    ]);

    const amountFromLabel = findNumberAfterLabel(full, [
      /\b(?:transaction\s*amount|txn\s*amount|withdrawal\s*amount|cash\s*withdrawal|amount\s*paid|paid\s*amount|debit\s*amount|credit\s*amount|amount|amt)\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    ]);

    let reference = referenceFromLabel;
    let parsedAmount = amountFromLabel;

    if (headers.length && cells.length) {
      const normalizeHeader = (value) => clean(value).toLowerCase();
      const headerIndex = (patterns) =>
        headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalizeHeader(header))));

      const rrnIndex = headerIndex([
        /\brrn\b/,
        /\butr\b/,
        /transaction\s*(id|no|number|ref|reference)/,
        /\breference\b/,
      ]);
      const amountIndex = headerIndex([
        /txn\s*amount/,
        /transaction\s*amount/,
        /withdrawal\s*amount/,
        /amount/,
        /amt/,
      ]);
      const serviceIndex = headerIndex([
        /txn\s*(mode|type)/,
        /transaction\s*(mode|type)/,
        /service/,
        /product/,
        /operation/,
      ]);
      const statusIndex = headerIndex([/^status$/, /txn\s*status/, /transaction\s*status/]);
      const dateIndex = headerIndex([/date\s*[&/]?\s*time/, /date.*time/, /^date$/, /time/]);
      const commissionIndex = headerIndex([/commission/, /comm\s*\//, /charges/]);
      const customerMobileIndex = headerIndex([/mobile/, /phone/, /contact/]);
      const bankIndex = headerIndex([/bank/]);
      const nameIndex = headerIndex([/customer\s*name/, /^name$/]);

      if (!reference && rrnIndex >= 0) reference = clean(cells[rrnIndex] || "");
      if (parsedAmount == null && amountIndex >= 0) parsedAmount = money(cells[amountIndex]);
      const mappedService = serviceIndex >= 0 ? clean(cells[serviceIndex] || "") : "";
      const mappedStatus = statusIndex >= 0 ? clean(cells[statusIndex] || "") : "";
      const occurredAt = dateIndex >= 0 ? clean(cells[dateIndex] || "") : "";
      const commission = commissionIndex >= 0 ? money(cells[commissionIndex]) : null;
      const customerMobile = customerMobileIndex >= 0 ? clean(cells[customerMobileIndex] || "") : "";
      const bankName = bankIndex >= 0 ? clean(cells[bankIndex] || "") : "";
      const customerName = nameIndex >= 0 ? clean(cells[nameIndex] || "") : "";

      options.mapped = {
        service: mappedService,
        status: mappedStatus,
        occurredAt,
        commission,
        customerMobile,
        bankName,
        customerName,
      };
    }

    if (!reference) {
      const fallbackRefs = clean(full)
        .replace(/[,₹]/g, "")
        .match(/\b\d{8,20}\b/g) || [];

      reference =
        fallbackRefs.find((value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) return false;
          if (numeric >= 0 && numeric <= 500000) return false; // likely amount
          if (/^[6-9]\d{9}$/.test(value)) return false; // likely mobile
          if (/^20\d{6}$/.test(value)) return false; // likely date
          return true;
        }) || "";
    }

    if (parsedAmount == null) {
      const currencyMatch =
        clean(full).match(/(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
      if (currencyMatch) parsedAmount = money(currencyMatch[1]);
    }

    if (parsedAmount == null && cells.length) {
      const numericCandidates = cells
        .map((cell) => money(cell))
        .filter((value) => value != null && value > 0 && value <= 500000);
      parsedAmount = numericCandidates[0] ?? null;
    }

    const mapped = options.mapped || {};
    const combinedService = clean(serviceText + " " + mapped.service + " " + full);

    const isPaymentCollection =
      /payment\s*collection|cash\s*collection|customer\s*payment|aadhaar\s*pay|merchant\s*pay|collection/i.test(
        combinedService
      );
    const isBalanceEnquiry =
      /balance\s*(enquiry|inquiry)|mini\s*statement/i.test(combinedService);
    const isCashOut =
      /cash\s*(?:withdrawal|out)|withdrawal|cashout|biometric\s*withdrawal/i.test(combinedService);

    const pageIsAeps =
      /aeps|aadhaar\s*(?:enabled|pay)|aadhaar\s*payment/i.test(
        clean(location.href) + " " + document.title + " " + pageContext
      );

    if (!reference || parsedAmount == null || parsedAmount <= 0) return null;

    // A transaction row must contain explicit AEPS/service evidence, or be
    // located on an AEPS transaction page. This prevents unrelated amounts in
    // headers/widgets from becoming false transaction detections.
    if (!isPaymentCollection && !isCashOut && !isBalanceEnquiry && !pageIsAeps) {
      return null;
    }

    const statusText = clean(mapped.status || full);
    if (/failed|rejected|declined|cancelled|reversed|refunded|pending\s*failed/i.test(statusText)) {
      return null;
    }

    const mobile =
      (mapped.customerMobile && mapped.customerMobile.match(/[6-9]\d{9}/)?.[0]) ||
      full.match(/(?:mobile|mob|phone|contact)\s*[:#=\-]?\s*([6-9]\d{9})/i)?.[1] ||
      "";

    const aadhaar =
      full.match(/(?:aadhaar|aadhar)\s*(?:last\s*4|no|number)?\s*[:#=\-]?\s*(?:[xX*#\s-]*)(\d{4})\b/i)?.[1] ||
      "";

    const bank =
      mapped.bankName ||
      firstMatch(full, [
        /(?:issuer\s*bank|customer\s*bank|beneficiary\s*bank|bank\s*name)\s*[:#=\-]?\s*([A-Za-z][A-Za-z .&'-]{2,60})/i,
        /\b(SBI|HDFC|ICICI|Axis|PNB|Canara|Kotak|Union\s+Bank|Bank\s+of\s+Baroda|Indian\s+Bank)\b/i,
      ]);

    const customerName =
      mapped.customerName ||
      firstMatch(full, [
        /customer\s*name\s*[:#=\-]\s*([A-Za-z][A-Za-z .'-]{2,80})/i,
      ]);

    const fee =
      findNumberAfterLabel(full, [
        /\b(?:customer\s*)?(?:fee|charge|surcharge)\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      ]);

    const commission =
      mapped.commission != null
        ? mapped.commission
        : findNumberAfterLabel(full, [
            /\b(?:portal\s*)?commission\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
          ]);

    const transactionType = isPaymentCollection
      ? "payment_collection"
      : isBalanceEnquiry
      ? "balance_enquiry"
      : /mini\s*statement/i.test(combinedService)
      ? "mini_statement"
      : "cash_out";

    const externalReference = reference;
    const occurredAt =
      mapped.occurredAt ||
      firstMatch(full, [
        /(?:date\s*&?\s*time|transaction\s*date|date|time)\s*[:#=\-]?\s*([^|]+)/i,
      ]);

    return {
      externalTransactionId: externalReference,
      externalReference,
      reference: externalReference,
      status: "success",
      transactionType,
      amount: Number(parsedAmount).toFixed(2),
      fee: fee == null ? null : Number(fee).toFixed(2),
      commission: commission == null ? "0" : Number(commission).toFixed(2),
      occurredAt,
      customerName,
      customerMobile: mobile,
      aadhaarLast4: aadhaar,
      bankName: bank,
      rawText: full,
    };
  };

  const pageText = document.body?.innerText || "";
  const authRequired = extractRenderedAuthSignals(pageText, location.href);

  if (authRequired) {
    return { authRequired: true, transactions: [] };
  }

  const candidates = [];
  const seenElements = new Set();

  const add = (candidate) => {
    if (!candidate) return;
    const key = [
      candidate.externalTransactionId || candidate.reference || "",
      candidate.amount || "",
      candidate.transactionType || "",
    ].join("|");
    if (!key || candidates.some((item) =>
      [
        item.externalTransactionId || item.reference || "",
        item.amount || "",
        item.transactionType || "",
      ].join("|") === key
    )) return;
    candidates.push(candidate);
  };

  // Strategy 1: conventional HTML tables with header mapping.
  const tables = Array.from(document.querySelectorAll("table")).filter(visible);
  for (const table of tables) {
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
    const headerCells = headerRow ? Array.from(headerRow.querySelectorAll("th,td")) : [];
    const headers = headerCells.map((cell) => clean(cell.innerText));
    if (!headers.length) continue;

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(visible);
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(":scope > td, :scope > th")).map((cell) => clean(cell.innerText));
      if (!cells.length) continue;

      const labeled = headers.map((header, index) => `${header}: ${cells[index] || ""}`).join(" | ");
      add(
        parseCandidate(labeled, {
          headers,
          cells,
          pageContext: pageText.slice(0, 8000),
        })
      );
    }
  }

  // Strategy 2: ARIA grids and virtualized data tables.
  const gridRows = Array.from(
    document.querySelectorAll(
      '[role="row"], [data-rowindex], [data-index][role="gridcell"], [class*="table-row"], [class*="grid-row"], [class*="transaction-row"], [class*="txn-row"]'
    )
  ).filter(visible);

  for (const row of gridRows) {
    if (seenElements.has(row)) continue;
    seenElements.add(row);

    const cells = Array.from(
      row.querySelectorAll('[role="gridcell"], [role="cell"], [data-field], [class*="cell"]')
    )
      .filter(visible)
      .map((cell) => clean(cell.innerText))
      .filter(Boolean);

    const text = clean(row.innerText);
    if (!text || text.length < 8 || text.length > 3000) continue;

    add(
      parseCandidate(
        cells.length > 1 ? cells.join(" | ") + " | " + text : text,
        {
          cells,
          pageContext: pageText.slice(0, 8000),
        }
      )
    );
  }

  // Strategy 3: list/card based transaction layouts.
  const cards = Array.from(
    document.querySelectorAll(
      "li, article, [data-transaction-id], [data-transaction], [class*='transaction-card'], [class*='txn-card'], [class*='passbook-row'], [class*='report-row']"
    )
  ).filter(visible);

  for (const card of cards) {
    if (seenElements.has(card)) continue;
    seenElements.add(card);

    const text = clean(card.innerText);
    if (!text || text.length < 8 || text.length > 2500) continue;

    add(parseCandidate(text, { pageContext: pageText.slice(0, 8000) }));
  }

  // Strategy 4: a conservative page-level fallback for portal pages that
  // render each transaction without semantic row elements. Only accept text
  // blocks that contain a labeled reference and amount.
  if (candidates.length === 0) {
    const blocks = Array.from(document.querySelectorAll("div, section")).filter(visible);
    const limited = blocks.filter((el) => {
      const text = clean(el.innerText);
      return text.length >= 20 && text.length <= 800 && /(?:RRN|UTR|Reference|Transaction\s*(?:ID|Ref)|Txn\s*(?:ID|Ref))/i.test(text);
    });

    for (const block of limited.slice(0, 100)) {
      const text = clean(block.innerText);
      add(parseCandidate(text, { pageContext: pageText.slice(0, 8000) }));
      if (candidates.length >= 25) break;
    }
  }

  return {
    authRequired: false,
    transactions: candidates.slice(0, 25),
  };
}

module.exports = { AepsWatcher };
