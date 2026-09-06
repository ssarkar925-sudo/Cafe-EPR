from pathlib import Path

path = Path('components/business/utility-bill-workspace.tsx')
text = path.read_text(encoding='utf-8')

old = '''  const activeBillerConfig: BillerConfig = useMemo(() => {
    return getBillerConfig(selectedBillerId) || getFallbackBillerConfig(selectedCategoryId, selectedBiller?.name || currentCategory.name);
  }, [selectedBillerId, selectedCategoryId, selectedBiller, currentCategory]);'''
new = '''  const activeBillerConfig: BillerConfig = useMemo(() => {
    return getBillerConfig(selectedBillerId) || getFallbackBillerConfig(selectedCategoryId, selectedBiller?.name || currentCategory.name);
  }, [selectedBillerId, selectedCategoryId, selectedBiller, currentCategory]);
  const activeBillerPrimaryKey = activeBillerConfig.parameters[0]?.key || "consumerId";'''
if text.count(old) != 1:
    raise SystemExit('Active biller config block not found exactly once')
text = text.replace(old, new, 1)

old = '''  useEffect(() => {
    const primaryKey = activeBillerConfig.parameters[0]?.key || "consumerId";
    const value = consumerId.trim();
    setBillerParams(value ? { [primaryKey]: value } : {});
    lastFetchedKeyRef.current = "";
  }, [selectedBillerId, selectedCategoryId, activeBillerConfig]);'''
new = '''  useEffect(() => {
    const value = consumerId.trim();
    setBillerParams(value ? { [activeBillerPrimaryKey]: value } : {});
    lastFetchedKeyRef.current = "";
  }, [selectedBillerId, selectedCategoryId, activeBillerPrimaryKey]);'''
if text.count(old) != 1:
    raise SystemExit('Active biller sync effect not found exactly once')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Bill auto-fetch effect dependency repaired.')
