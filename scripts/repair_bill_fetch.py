from pathlib import Path

utility = Path('components/business/utility-bill-workspace.tsx')
api = Path('app/api/bill-payment/fetch/route.ts')
text = utility.read_text(encoding='utf-8')

old = '''  // Loan EMI
  { id: "bajaj_finance", categoryId: "loan", name: "Bajaj Finance Limited", shortName: "Bajaj Finance", commission: 10 },
  { id: "home_credit", categoryId: "loan", name: "Home Credit India", shortName: "Home Credit", commission: 10 },
  { id: "tata_capital", categoryId: "loan", name: "Tata Capital Financial Services", shortName: "Tata Capital", commission: 10 },
  { id: "muthoot_finance", categoryId: "loan", name: "Muthoot Finance Limited", shortName: "Muthoot Finance", commission: 10 },'''
new = '''  // Loan EMI
  { id: "bajaj_finance", categoryId: "loan", name: "Bajaj Finance Limited", shortName: "Bajaj Finance", commission: 10 },
  { id: "home_credit", categoryId: "loan", name: "Home Credit India", shortName: "Home Credit", commission: 10 },
  { id: "tata_capital", categoryId: "loan", name: "Tata Capital Financial Services", shortName: "Tata Capital", commission: 10 },
  { id: "muthoot_finance", categoryId: "loan", name: "Muthoot Finance Limited", shortName: "Muthoot Finance", commission: 10 },
  { id: "hdb_financial", categoryId: "loan", name: "HDB Financial Services", shortName: "HDB Financial", commission: 10 },
  { id: "shriram_finance", categoryId: "loan", name: "Shriram Finance Limited", shortName: "Shriram Finance", commission: 10 },
  { id: "mahindra_finance", categoryId: "loan", name: "Mahindra & Mahindra Financial Services", shortName: "Mahindra Finance", commission: 10 },
  { id: "manappuram_finance", categoryId: "loan", name: "Manappuram Finance Limited", shortName: "Manappuram Finance", commission: 10 },
  { id: "chola_finance", categoryId: "loan", name: "Cholamandalam Investment and Finance Company", shortName: "Chola Finance", commission: 10 },
  { id: "iifl_finance", categoryId: "loan", name: "IIFL Finance Limited", shortName: "IIFL Finance", commission: 10 },
  { id: "l_and_t_finance", categoryId: "loan", name: "L&T Finance Limited", shortName: "L&T Finance", commission: 10 },
  { id: "piramal_finance", categoryId: "loan", name: "Piramal Finance Limited", shortName: "Piramal Finance", commission: 10 },
  { id: "aditya_birla_finance", categoryId: "loan", name: "Aditya Birla Finance Limited", shortName: "Aditya Birla Finance", commission: 10 },
  { id: "poonawalla_fincorp", categoryId: "loan", name: "Poonawalla Fincorp Limited", shortName: "Poonawalla Fincorp", commission: 10 },'''
if text.count(old) != 1:
    raise SystemExit('Loan provider block not found exactly once')
text = text.replace(old, new, 1)

old = '''  // Reset biller when category changes
  useEffect(() => {
    const firstBiller = billersForCategory[0];
    setSelectedBillerId(firstBiller ? firstBiller.id : "");
    setFetchedBill(null);
  }, [selectedCategoryId, billersForCategory]);'''
new = '''  // Reset biller and stale lookup state when category changes.
  useEffect(() => {
    const firstBiller = billersForCategory[0];
    setSelectedBillerId(firstBiller ? firstBiller.id : "");
    setFetchedBill(null);
    setFetchBadge(null);
    setBillerParams({});
    lastFetchedKeyRef.current = "";
  }, [selectedCategoryId, billersForCategory]);

  // Keep the currently entered account bound to the active biller parameter.
  // This fixes auto-fetch after switching billers while an account is already typed.
  useEffect(() => {
    const primaryKey = activeBillerConfig.parameters[0]?.key || "consumerId";
    const value = consumerId.trim();
    setBillerParams(value ? { [primaryKey]: value } : {});
    lastFetchedKeyRef.current = "";
  }, [selectedBillerId, selectedCategoryId, activeBillerConfig]);'''
if text.count(old) != 1:
    raise SystemExit('Category reset block not found exactly once')
text = text.replace(old, new, 1)

old = '''    const payloadParams = { ...paramsToFetch, [primaryKey]: primaryVal };
    const queryKey = `${selectedBillerId}:${JSON.stringify(payloadParams)}`;'''
new = '''    const payloadParams: Record<string, string> = {};
    for (const param of activeBillerConfig.parameters) {
      const value = String(paramsToFetch[param.key] ?? (param.key === primaryKey ? primaryVal : "")).trim();
      if (value) payloadParams[param.key] = value;
    }
    payloadParams[primaryKey] = primaryVal;

    const queryKey = `${selectedBillerId}:${JSON.stringify(payloadParams)}`;'''
if text.count(old) != 1:
    raise SystemExit('Fetch payload block not found exactly once')
text = text.replace(old, new, 1)

old = '''                    onChange={(e) => {
                      const val = e.target.value;
                      setConsumerId(val);
                      const pKey = activeBillerConfig.parameters[0]?.key || "consumerId";
                      setBillerParams((prev) => ({ ...prev, [pKey]: val }));
                    }}'''
new = '''                    onChange={(e) => {
                      const val = e.target.value;
                      setConsumerId(val);
                      const pKey = activeBillerConfig.parameters[0]?.key || "consumerId";
                      setBillerParams(val.trim() ? { [pKey]: val } : {});
                      lastFetchedKeyRef.current = "";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleFetchBill();
                      }
                    }}'''
if text.count(old) != 1:
    raise SystemExit('Consumer input handler not found exactly once')
text = text.replace(old, new, 1)

old = '''    const timer = setTimeout(() => {
      executeBillFetch(payloadParams, false);
    }, 350);'''
new = '''    const timer = setTimeout(() => {
      void executeBillFetch(payloadParams, false);
    }, 500);'''
if text.count(old) != 1:
    raise SystemExit('Auto-fetch timer block not found exactly once')
text = text.replace(old, new, 1)

utility.write_text(text, encoding='utf-8')

route = api.read_text(encoding='utf-8')
old = '''  const biller = getBillerConfig(billerId) || getFallbackBillerConfig(category || "electricity", billerId);
  for (const param of biller.parameters) if (param.required && !parameters[param.key]) return NextResponse.json({ ok: false, source: "invalid_input", error: `Parameter "${param.label}" is required.` }, { status: 400 });'''
new = '''  const biller = getBillerConfig(billerId);
  if (!biller) {
    return NextResponse.json({
      ok: false,
      configured: false,
      source: "unconfigured",
      billerId,
      billerName: billerId,
      error: "Live bill fetch is not configured for this biller yet.",
      status: "unverified",
    }, { status: 200 });
  }
  if (!biller.supportsFetch) {
    return NextResponse.json({
      ok: false,
      configured: false,
      source: "unconfigured",
      billerId,
      billerName: biller.billerName,
      error: "Live bill fetch is disabled for this biller until its gateway mapping is configured.",
      status: "unverified",
    }, { status: 200 });
  }
  for (const param of biller.parameters) if (param.required && !parameters[param.key]) return NextResponse.json({ ok: false, source: "invalid_input", error: `Parameter "${param.label}" is required.` }, { status: 400 });'''
if route.count(old) != 1:
    raise SystemExit('API biller resolution block not found exactly once')
route = route.replace(old, new, 1)
api.write_text(route, encoding='utf-8')

print('Bill auto-fetch repair patch applied.')
