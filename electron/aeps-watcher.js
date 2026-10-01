const { BrowserWindow } = require("electron");
const { AepsNetworkInterceptor } = require("./aeps-network-interceptor.js");

class AepsWatcher {
  constructor() {
    this.window = null;
    this.sourceWindows = new Map();
    this.sourceSessions = new Map();
    this.networkInterceptors = new Map();
    this.timer = null;
    this.config = null;
    this.emit = null;
    this.seen = new Set();
    this.polling = false;
    this.liveConfig = null;
    this.liveEmit = null;
    this.liveSeen = new Set();
    this.activeSessions = new Map();
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

    // Attach CDP Passive Network Interceptor to capture raw JSON banking responses in-flight
    try {
      const attachCdp = (targetWebContents, targetId) => {
        try {
          const interceptor = new AepsNetworkInterceptor(targetWebContents, (obs) => {
            const session = this.processJourneyObservation({
              portalId: this.config?.portalId,
              portalName: this.config?.portalName,
              sourceUrl: this.config?.sourceUrl,
              stage: obs.stage,
              fields: obs.fields,
              evidence: obs.evidence,
            });
            this.emit({
              type: "transaction_journey",
              portalId: this.config?.portalId,
              portalName: this.config?.portalName,
              stage: obs.stage,
              session,
              observedVia: "network_interception",
            });
          });
          interceptor.attach();
          this.networkInterceptors.set(targetId, interceptor);
        } catch (e) {
          console.warn(`[AepsWatcher] Failed to attach network interceptor to ${targetId}:`, e.message);
        }
      };

      attachCdp(this.window.webContents, "main");

      // Auto-attach CDP interceptor to any popup or window opened by the portal
      this.window.webContents.setWindowOpenHandler(({ url }) => {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            webPreferences: {
              partition: "aeps-watcher-" + this.config.portalId,
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      });

      this.window.webContents.on("did-create-window", (childWindow) => {
        const childId = `popup-main-${Date.now()}`;
        attachCdp(childWindow.webContents, childId);
      });
    } catch (e) {
      console.warn("[AepsWatcher] Failed to initialize network interceptors on main window:", e.message);
    }

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

        // Journey observation for FINAL stage
        const journeySession = this.processJourneyObservation({
          portalId: this.config.portalId,
          portalName: this.config.portalName,
          stage: "FINAL",
          fields: {
            rrn: transaction.externalTransactionId || transaction.reference,
            reference: transaction.externalTransactionId || transaction.reference,
            transactionId: transaction.externalTransactionId || transaction.reference,
            amount: Number(transaction.amount) || null,
            transactionType: transaction.transactionType || "cash_out",
            bank: transaction.bankName || null,
            customerMobile: transaction.customerMobile || null,
            aadhaarLast4: transaction.aadhaarLast4 || null,
            status: "SUCCESS",
          },
          evidence: { rawTextSnippet: transaction.rawText || "" },
        });

        this.emit({
          type: "transaction_journey",
          portalId: this.config.portalId,
          portalName: this.config.portalName,
          stage: "FINAL",
          session: journeySession,
        });
      }

      // Also inspect page for ENTRY or PASSBOOK journey stages
      try {
        const journeyScan = await this.window.webContents.executeJavaScript(
          "(" + extractJourneyObservations.toString() + ")()",
          true
        );
        if (journeyScan && (journeyScan.stage === "FINAL" || journeyScan.stage === "ENTRY" || journeyScan.stage === "PASSBOOK")) {
          if (journeyScan.stage === "FINAL" && journeyScan.fields) {
            const session = this.processJourneyObservation({
              portalId: this.config.portalId,
              portalName: this.config.portalName,
              stage: "FINAL",
              fields: journeyScan.fields,
              evidence: journeyScan.evidence || { url: journeyScan.pageUrl, title: journeyScan.pageTitle },
            });
            this.emit({
              type: "transaction_journey",
              portalId: this.config.portalId,
              portalName: this.config.portalName,
              stage: "FINAL",
              session,
            });
          } else if (journeyScan.stage === "PASSBOOK" && Array.isArray(journeyScan.passbookRecords)) {
            for (const pb of journeyScan.passbookRecords) {
              const session = this.processJourneyObservation({
                portalId: this.config.portalId,
                portalName: this.config.portalName,
                stage: "PASSBOOK",
                fields: {
                  rrn: pb.rrn || pb.reference,
                  reference: pb.reference,
                  amount: pb.amount,
                  status: pb.status || "SUCCESS",
                },
                evidence: { rawTextSnippet: pb.rawTextSnippet, url: journeyScan.pageUrl },
              });
              this.emit({
                type: "transaction_journey",
                portalId: this.config.portalId,
                portalName: this.config.portalName,
                stage: "PASSBOOK",
                session,
              });
            }
          } else if (journeyScan.stage === "ENTRY" && journeyScan.fields) {
            const session = this.processJourneyObservation({
              portalId: this.config.portalId,
              portalName: this.config.portalName,
              stage: "ENTRY",
              fields: journeyScan.fields,
              evidence: { url: journeyScan.pageUrl, title: journeyScan.pageTitle },
            });
            this.emit({
              type: "transaction_journey",
              portalId: this.config.portalId,
              portalName: this.config.portalName,
              stage: "ENTRY",
              session,
            });
          }
        }
      } catch {}

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

      // Attach CDP Passive Network Interceptor to each source window
      try {
        const attachSourceCdp = (targetWebContents, targetId) => {
          try {
            const interceptor = new AepsNetworkInterceptor(targetWebContents, (obs) => {
              const session = this.processJourneyObservation({
                portalId,
                portalName,
                sourceId,
                sourceUrl,
                stage: obs.stage,
                fields: obs.fields,
                evidence: obs.evidence,
              });
              this.liveEmit?.({
                type: "transaction_journey",
                portalId,
                portalName,
                sourceId,
                sourceUrl,
                stage: obs.stage,
                session,
                observedVia: "network_interception",
              });
            });
            interceptor.attach();
            this.networkInterceptors.set(targetId, interceptor);
          } catch (e) {
            console.warn(`[AepsWatcher] Failed to attach network interceptor to source ${targetId}:`, e.message);
          }
        };

        attachSourceCdp(win.webContents, sourceId);

        // Auto-attach CDP interceptor to any popup or window opened by this source
        win.webContents.setWindowOpenHandler(({ url }) => {
          return {
            action: "allow",
            overrideBrowserWindowOptions: {
              webPreferences: {
                partition,
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
              },
            },
          };
        });

        win.webContents.on("did-create-window", (childWindow) => {
          const childId = `popup-${sourceId}-${Date.now()}`;
          attachSourceCdp(childWindow.webContents, childId);
        });
      } catch (e) {
        console.warn(`[AepsWatcher] Failed to initialize network interceptors for source ${sourceId}:`, e.message);
      }

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

      for (const transaction of result?.transactions || []) {
        const reference =
          transaction.externalTransactionId ||
          transaction.reference ||
          transaction.externalReference ||
          "";

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

        const journeySession = this.processJourneyObservation({
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          stage: "FINAL",
          fields: {
            rrn: reference,
            reference,
            transactionId: reference,
            amount: Number(transaction.amount) || null,
            transactionType: transaction.transactionType || "cash_out",
            bank: transaction.bankName || null,
            customerMobile: transaction.customerMobile || null,
            aadhaarLast4: transaction.aadhaarLast4 || null,
            status: "SUCCESS",
          },
          evidence: { rawTextSnippet: transaction.rawText || "", url: String(source.url) },
        });

        this.liveEmit?.({
          type: "transaction_journey",
          portalId,
          portalName,
          sourceId,
          sourceUrl: String(source.url),
          stage: "FINAL",
          session: journeySession,
        });
      }

      // Check for ENTRY and PASSBOOK stages on this source window
      try {
        const journeyScan = await session.win.webContents.executeJavaScript(
          "(" + extractJourneyObservations.toString() + ")()",
          true
        );
        if (journeyScan && (journeyScan.stage === "FINAL" || journeyScan.stage === "ENTRY" || journeyScan.stage === "PASSBOOK")) {
          if (journeyScan.stage === "FINAL" && journeyScan.fields) {
            const sessionFinal = this.processJourneyObservation({
              portalId,
              portalName,
              sourceId,
              sourceUrl: String(source.url),
              stage: "FINAL",
              fields: journeyScan.fields,
              evidence: journeyScan.evidence || { url: journeyScan.pageUrl, title: journeyScan.pageTitle },
            });
            this.liveEmit?.({
              type: "transaction_journey",
              portalId,
              portalName,
              sourceId,
              sourceUrl: String(source.url),
              stage: "FINAL",
              session: sessionFinal,
            });
          } else if (journeyScan.stage === "PASSBOOK" && Array.isArray(journeyScan.passbookRecords)) {
            for (const pb of journeyScan.passbookRecords) {
              const sessionPb = this.processJourneyObservation({
                portalId,
                portalName,
                sourceId,
                sourceUrl: String(source.url),
                stage: "PASSBOOK",
                fields: {
                  rrn: pb.rrn || pb.reference,
                  reference: pb.reference,
                  amount: pb.amount,
                  status: pb.status || "SUCCESS",
                },
                evidence: { rawTextSnippet: pb.rawTextSnippet, url: journeyScan.pageUrl },
              });
              this.liveEmit?.({
                type: "transaction_journey",
                portalId,
                portalName,
                sourceId,
                sourceUrl: String(source.url),
                stage: "PASSBOOK",
                session: sessionPb,
              });
            }
          } else if (journeyScan.stage === "ENTRY" && journeyScan.fields) {
            const sessionEntry = this.processJourneyObservation({
              portalId,
              portalName,
              sourceId,
              sourceUrl: String(source.url),
              stage: "ENTRY",
              fields: journeyScan.fields,
              evidence: { url: journeyScan.pageUrl, title: journeyScan.pageTitle },
            });
            this.liveEmit?.({
              type: "transaction_journey",
              portalId,
              portalName,
              sourceId,
              sourceUrl: String(source.url),
              stage: "ENTRY",
              session: sessionEntry,
            });
          }
        }
      } catch {}

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
      journeySessions: Array.from(this.activeSessions.values()),
    };
  }

  async stop() {
    this.clearTimer();
    this.polling = false;
    const current = this.config?.portalId;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    for (const interceptor of this.networkInterceptors.values()) {
      try {
        interceptor.detach();
      } catch {}
    }
    this.networkInterceptors.clear();
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
    this.activeSessions.clear();
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
      /\b(?:bank\s*ref(?:\.?\s*(?:no|num|number))?|rrn|utr|reference(?:\s*(?:id|no|number))?|transaction\s*(?:id|no|number|ref|reference)|txn\s*(?:id|no|number|ref|reference))\s*[:#=\-]?\s*([A-Za-z0-9][A-Za-z0-9._\/-]{5,35})/i,
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
        /\b(?:bank\s*ref|rrn|utr)\b/,
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
      full.match(/(?:aadhaar|aadhar|customer\s*id)\s*(?:last\s*4|no|number)?\s*[:#=\-]?\s*(?:[xX*#\s-]*)(\d{4})\b/i)?.[1] ||
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

  // Strategy 3: list/card based transaction layouts and modal/receipt views.
  const cards = Array.from(
    document.querySelectorAll(
      "li, article, [data-transaction-id], [data-transaction], [class*='transaction-card'], [class*='txn-card'], [class*='passbook-row'], [class*='report-row'], [class*='receipt'], [id*='receipt'], [class*='modal-content'], [class*='modal-body'], [role='dialog'], .swal2-popup"
    )
  ).filter(visible);

  for (const card of cards) {
    if (seenElements.has(card)) continue;
    seenElements.add(card);

    const text = clean(card.innerText);
    if (!text || text.length < 8 || text.length > 3500) continue;

    add(parseCandidate(text, { pageContext: pageText.slice(0, 8000) }));
  }

  // Strategy 4: a conservative page-level fallback for portal pages that
  // render each transaction without semantic row elements. Only accept text
  // blocks that contain a labeled reference and amount.
  if (candidates.length === 0) {
    const blocks = Array.from(document.querySelectorAll("div, section, main")).filter(visible);
    const limited = blocks.filter((el) => {
      const text = clean(el.innerText);
      return (
        text.length >= 20 &&
        text.length <= 3000 &&
        /(?:bank\s*ref|rrn|utr|reference|transaction\s*(?:id|ref)|txn\s*(?:id|ref))/i.test(text)
      );
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

function extractJourneyObservations() {
  const clean = (val) =>
    String(val || "")
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

  const isSecretControl = (el) => {
    const text = clean(
      (el.name || "") + " " +
      (el.id || "") + " " +
      (el.getAttribute("aria-label") || "") + " " +
      (el.placeholder || "")
    ).toLowerCase();
    const type = String(el.type || "").toLowerCase();
    return (
      type === "password" ||
      /\b(password|passcode|otp|pin|cvv|secret|biometric|fingerprint)\b/i.test(text)
    );
  };

  const money = (value) => {
    const raw = clean(value).replace(/,/g, "");
    const currency =
      raw.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
      raw.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/);
    if (!currency) return null;
    const n = Number(currency[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const pageText = clean(document.body?.innerText || "");
  const pageUrl = clean(location.href);
  const pageTitle = clean(document.title);

  // 0. STAGE: FINAL / RECEIPT (Success slips, receipt modals, confirmation screens)
  const isFinalReceipt =
    /\b(?:transaction\s*receipt|payment\s*receipt|receipt)\b/i.test(pageText) ||
    (/\b(?:payment\s*status\s*[:#=\-]?\s*success|withdrawal\s*successful|transaction\s*successful)\b/i.test(pageText) &&
      /\b(?:rrn|bank\s*ref|transaction\s*id)\b/i.test(pageText));

  if (isFinalReceipt) {
    const rrnMatch =
      pageText.match(/\b(?:rrn|bank\s*ref(?:\.?\s*(?:no|number))?)\s*[:#=\-]?\s*([0-9A-Za-z]{6,35})/i) ||
      pageText.match(/\b(?:transaction\s*id|txn\s*id)\s*[:#=\-]?\s*([0-9A-Za-z]{6,35})/i);
    const amtMatch = pageText.match(
      /\b(?:amount|amt|withdrawal\s*amount)\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
    );
    const bankMatch = pageText.match(
      /\b(?:bank\s*name|issuer\s*bank|customer\s*bank)\s*[:#=\-]?\s*([A-Za-z][A-Za-z .&'-]{2,60})/i
    );
    const aadhaarMatch = pageText.match(
      /\b(?:customer\s*id|aadhaar|aadhar)\s*(?:last\s*4|no|number)?\s*[:#=\-]?\s*(?:[xX*#\s-]*)(\d{4})\b/i
    );
    const mobileMatch = pageText.match(/\b(?:mobile|phone|contact)\s*[:#=\-]?\s*([6-9]\d{9})/i);
    const txnTypeMatch = pageText.match(
      /\b(?:transaction\s*type|service\s*type|type)\s*[:#=\-]?\s*([^|\n\r]+)/i
    );

    const parsedAmt = amtMatch ? money(amtMatch[1]) : null;
    const ref = rrnMatch ? clean(rrnMatch[1]) : "";

    if (ref && parsedAmt) {
      return {
        stage: "FINAL",
        fields: {
          rrn: ref,
          reference: ref,
          transactionId: ref,
          amount: parsedAmt,
          bank: bankMatch ? clean(bankMatch[1]) : null,
          aadhaarLast4: aadhaarMatch ? clean(aadhaarMatch[1]) : null,
          customerMobile: mobileMatch ? clean(mobileMatch[1]) : null,
          transactionType: txnTypeMatch ? clean(txnTypeMatch[1]) : "cash_out",
          status: "SUCCESS",
        },
        evidence: {
          rawTextSnippet: pageText.slice(0, 1500),
          url: pageUrl,
          title: pageTitle,
        },
        pageUrl,
        pageTitle,
      };
    }
  }

  // 1. STAGE: PASSBOOK / HISTORY
  const isPassbookSignal =
    /\b(passbook|transaction\s*history|txn\s*history|account\s*statement|statement|mini\s*statement|aeps\s*history|aeps\s*report|daily\s*report)\b/i.test(
      pageUrl + " " + pageTitle + " " + pageText.slice(0, 500)
    );

  const tables = Array.from(document.querySelectorAll("table, [role='grid'], [role='table']")).filter(visible);
  if (isPassbookSignal && tables.length > 0) {
    const candidates = [];
    const rows = Array.from(document.querySelectorAll("tbody tr, [role='row']")).filter(visible);
    for (const row of rows.slice(0, 15)) {
      const text = clean(row.innerText);
      if (text.length < 15) continue;
      const ref = text.match(/\b(?:RRN|UTR|Ref|Txn|ID)?[:#=\-\s]*([A-Za-z0-9]{8,24})\b/i)?.[1] || "";
      const amtMatch = text.match(/(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
      const amt = amtMatch ? money(amtMatch[1]) : null;
      if (amt && amt > 0) {
        candidates.push({
          reference: ref || null,
          rrn: ref || null,
          amount: amt,
          status: /success|completed|credit|debit/i.test(text) ? "SUCCESS" : "RECORDED",
          rawTextSnippet: text.slice(0, 200),
        });
      }
    }

    if (candidates.length > 0) {
      return {
        stage: "PASSBOOK",
        passbookRecords: candidates,
        pageUrl,
        pageTitle,
      };
    }
  }

  // 2. STAGE: ENTRY FORM (detect input fields being typed or filled)
  const inputElements = Array.from(
    document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea")
  ).filter(visible);

  const nonSecretInputs = inputElements.filter((el) => !isSecretControl(el));
  let detectedMobile = "";
  let detectedAadhaarLast4 = "";
  let detectedAmount = null;
  let detectedBank = "";
  let detectedType = "";

  for (const el of nonSecretInputs) {
    const val = clean(el.value || el.innerText || "");
    const desc = clean(
      (el.name || "") + " " +
      (el.id || "") + " " +
      (el.getAttribute("aria-label") || "") + " " +
      (el.placeholder || "") + " " +
      (el.labels?.[0]?.innerText || "")
    ).toLowerCase();

    // Customer mobile
    if (/\b(mobile|phone|contact)\b/i.test(desc)) {
      const m = val.replace(/\D/g, "");
      if (m.length === 10) detectedMobile = m;
    }

    // Aadhaar last 4
    if (/\b(aadhaar|aadhar)\b/i.test(desc)) {
      const a = val.replace(/\D/g, "");
      if (a.length === 4) detectedAadhaarLast4 = a;
      else if (a.length === 12) detectedAadhaarLast4 = a.slice(-4);
    }

    // Amount
    if (/\b(amount|amt)\b/i.test(desc)) {
      const n = money(val);
      if (n != null && n > 0 && n <= 50000) detectedAmount = n;
    }

    // Bank
    if (/\b(bank|issuer)\b/i.test(desc) && val.length >= 3) {
      detectedBank = val;
    }

    // Transaction type
    if (/\b(type|mode|service)\b/i.test(desc) && val.length >= 3) {
      detectedType = val;
    }
  }

  if (detectedMobile || detectedAadhaarLast4 || detectedAmount) {
    return {
      stage: "ENTRY",
      fields: {
        customerMobile: detectedMobile || null,
        aadhaarLast4: detectedAadhaarLast4 || null,
        amount: detectedAmount,
        bank: detectedBank || null,
        transactionType: detectedType || null,
      },
      pageUrl,
      pageTitle,
    };
  }

  return { stage: "INTERMEDIATE", fields: {}, pageUrl, pageTitle };
}

// Attach journey methods to AepsWatcher prototype
AepsWatcher.prototype.getOrCreateJourneySession = function (portalId, portalName, fields, stage) {
  const cleanFields = sanitizeFields(fields);
  const primaryRef = computePrimaryReference(cleanFields);
  const fallback = computeFallbackKey(portalId, cleanFields);

  if (primaryRef) {
    for (const s of this.activeSessions.values()) {
      if (s.portalId === portalId && s.primaryReference === primaryRef) {
        return s;
      }
    }
  }

  if (fallback) {
    for (const s of this.activeSessions.values()) {
      if (s.portalId === portalId && s.status !== "EXPIRED") {
        if (s.fallbackKey === fallback) return s;
        if (
          cleanFields.customerMobile &&
          s.fields.customerMobile === cleanFields.customerMobile &&
          cleanFields.amount != null &&
          s.fields.amount === cleanFields.amount
        ) {
          return s;
        }
      }
    }
  }

  const sessionId = "aeps-journey-" + portalId + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const session = {
    sessionId,
    portalId,
    portalName,
    createdAt: now,
    updatedAt: now,
    status: "COLLECTING",
    currentStage: stage,
    fields: { ...cleanFields },
    observations: [],
    conflicts: [],
    verification: {
      customer: false,
      amount: false,
      bank: false,
      reference: false,
      transactionType: false,
      passbook: false,
    },
    primaryReference: primaryRef,
    fallbackKey: fallback,
    passbookRecord: null,
    passbookMatchedAt: null,
  };

  this.activeSessions.set(sessionId, session);
  if (this.activeSessions.size > 200) {
    const oldestKey = this.activeSessions.keys().next().value;
    if (oldestKey) this.activeSessions.delete(oldestKey);
  }

  return session;
};

AepsWatcher.prototype.processJourneyObservation = function (rawObs) {
  const sanitized = sanitizeFields(rawObs.fields || {});
  const session = this.getOrCreateJourneySession(
    rawObs.portalId,
    rawObs.portalName,
    sanitized,
    rawObs.stage
  );

  const observation = {
    id: "obs-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    sessionId: session.sessionId,
    portalId: rawObs.portalId,
    portalName: rawObs.portalName,
    sourceId: rawObs.sourceId,
    sourceUrl: rawObs.sourceUrl,
    stage: rawObs.stage,
    capturedAt: new Date().toISOString(),
    fields: sanitized,
    evidence: rawObs.evidence || {},
  };

  session.observations.push(observation);
  session.updatedAt = new Date().toISOString();
  session.currentStage = rawObs.stage;

  // Conflict Detection
  const existing = session.fields;
  if (existing.amount != null && sanitized.amount != null) {
    if (Math.abs(Number(existing.amount) - Number(sanitized.amount)) >= 0.01) {
      const conflictMsg = "Amount mismatch: previously ₹" + existing.amount + ", now ₹" + sanitized.amount + " in " + rawObs.stage;
      if (!session.conflicts.some((c) => c.field === "amount")) {
        session.conflicts.push({
          field: "amount",
          message: conflictMsg,
          entryValue: existing.amount,
          finalValue: rawObs.stage === "FINAL" ? sanitized.amount : undefined,
          passbookValue: rawObs.stage === "PASSBOOK" ? sanitized.amount : undefined,
          sourceVariants: [{ sourceUrl: rawObs.sourceUrl, value: sanitized.amount, stage: rawObs.stage }],
        });
      }
      session.status = "CONFLICT";
    }
  }

  const existRef = computePrimaryReference(existing);
  const newRef = computePrimaryReference(sanitized);
  if (existRef && newRef && existRef !== newRef) {
    if (!session.conflicts.some((c) => c.field === "reference")) {
      session.conflicts.push({
        field: "reference",
        message: "Reference mismatch: previously " + existRef + ", now " + newRef,
        entryValue: existRef,
        sourceVariants: [{ sourceUrl: rawObs.sourceUrl, value: newRef, stage: rawObs.stage }],
      });
    }
    session.status = "CONFLICT";
  }

  // Merge fields
  if (rawObs.stage === "PASSBOOK") {
    session.passbookRecord = { ...sanitized };
    session.passbookMatchedAt = new Date().toISOString();
  }

  for (const [k, v] of Object.entries(sanitized)) {
    if (v == null || v === "") continue;
    if (session.fields[k] == null || session.fields[k] === "") {
      session.fields[k] = v;
    }
  }

  const finalRef = computePrimaryReference(session.fields);
  if (finalRef && !session.primaryReference) {
    session.primaryReference = finalRef;
  }

  // Evaluate status
  if (session.conflicts.length > 0) {
    session.status = "CONFLICT";
  } else {
    const stagesSeen = new Set(session.observations.map((o) => o.stage));
    session.verification.customer = Boolean(session.fields.customerMobile || session.fields.customerName || session.fields.aadhaarLast4);
    session.verification.amount = Boolean(session.fields.amount != null && Number(session.fields.amount) > 0);
    session.verification.bank = Boolean(session.fields.bank);
    session.verification.reference = Boolean(session.fields.rrn || session.fields.reference || session.fields.transactionId);
    session.verification.transactionType = Boolean(session.fields.transactionType);
    session.verification.passbook = Boolean(stagesSeen.has("PASSBOOK") && session.passbookRecord);

    const hasFinal = stagesSeen.has("FINAL");
    const hasPassbook = stagesSeen.has("PASSBOOK");
    const isSuccess = /success|completed|approved/i.test(session.fields.status || "success");

    if (hasFinal && isSuccess) {
      if (hasPassbook) {
        const pb = session.passbookRecord;
        const refMatch = !pb?.reference || !session.fields.reference || pb.reference.toLowerCase() === session.fields.reference.toLowerCase();
        const amtMatch = pb?.amount == null || session.fields.amount == null || Math.abs(Number(pb.amount) - Number(session.fields.amount)) < 0.01;
        session.status = (refMatch && amtMatch) ? "RECONCILED" : "CONFLICT";
      } else {
        session.status = "FINAL_CONFIRMED";
      }
    } else {
      session.status = "COLLECTING";
    }
  }

  return session;
};

// Pure sanitizeFields and reference computation for Electron CJS
function sanitizeFields(raw) {
  const SENSITIVE = [/\botp\b/i, /\bpin\b/i, /pass(?:word|code)?/i, /biometric/i, /finger(?:print)?/i, /secret/i, /cvv/i];
  const clean = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (SENSITIVE.some((p) => p.test(k))) continue;
    if (typeof v === "string") {
      const a = v.replace(/\D/g, "");
      if (a.length === 12 && k.toLowerCase().includes("aadhaar")) {
        clean.aadhaarLast4 = a.slice(-4);
        continue;
      }
    }
    clean[k] = v;
  }
  const ref = clean.reference || clean.rrn || clean.transactionId || clean.utr || null;
  if (ref) {
    clean.reference = String(ref).trim();
    if (!clean.rrn) clean.rrn = clean.reference;
    if (!clean.transactionId) clean.transactionId = clean.reference;
  }
  if (clean.amount != null) {
    const num = Number(clean.amount);
    clean.amount = Number.isFinite(num) && num > 0 ? num : null;
  }
  if (clean.customerMobile) {
    const m = String(clean.customerMobile).replace(/\D/g, "").slice(-10);
    clean.customerMobile = m.length === 10 ? m : null;
  }
  if (clean.aadhaarLast4) {
    const a = String(clean.aadhaarLast4).replace(/\D/g, "").slice(-4);
    clean.aadhaarLast4 = a.length === 4 ? a : null;
  }
  return clean;
}

function computePrimaryReference(fields) {
  const ref = fields?.rrn || fields?.transactionId || fields?.reference || fields?.utr;
  return ref ? String(ref).trim() : null;
}

function computeFallbackKey(portalId, fields) {
  const mobile = fields?.customerMobile || "";
  const aadhaar = fields?.aadhaarLast4 || "";
  const amount = fields?.amount != null ? Number(fields.amount).toFixed(2) : "";
  const type = fields?.transactionType || "cash_out";
  if (!mobile && !aadhaar && !amount) return null;
  return (portalId + "|" + mobile + "|" + aadhaar + "|" + amount + "|" + type).toLowerCase();
}

module.exports = {
  AepsWatcher,
  sanitizeFields,
  computePrimaryReference,
  computeFallbackKey,
  extractJourneyObservations,
};

