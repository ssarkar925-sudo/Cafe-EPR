import { readFileSync } from "fs";

console.log("=== COMPREHENSIVE THEME & DISPLAY OPTIONS VERIFICATION ===");

// 1. Check globals.css for all required selectors and variables
const globalsCss = readFileSync("app/globals.css", "utf8");

const requiredCssChecks = [
  { name: "Root density variables", pattern: /--erp-cell-py:\s*0\.85rem/ },
  { name: "Compact density overrides", pattern: /html\.density-compact[\s\S]*--erp-cell-py:\s*0\.45rem/ },
  { name: "Compact input density rules", pattern: /html\.density-compact input/ },
  { name: "Large font scale scaler", pattern: /html\.font-scale-large[\s\S]*font-size:\s*16\.5px/ },
  { name: "Brand accent: Blue", pattern: /html\[data-accent="blue"\]/ },
  { name: "Brand accent: Emerald", pattern: /html\[data-accent="emerald"\]/ },
  { name: "Brand accent: Violet", pattern: /html\[data-accent="violet"\]/ },
  { name: "Brand accent: Amber", pattern: /html\[data-accent="amber"\]/ },
  { name: "Brand accent: Rose", pattern: /html\[data-accent="rose"\]/ },
  { name: "Brand accent: Cyan", pattern: /html\[data-accent="cyan"\]/ },
  { name: "Motion reduction rule", pattern: /\[data-motion="off"\]/ },
  { name: "High contrast outline", pattern: /\.contrast-more/ },
  { name: "Ambient preset: aurora", pattern: /html\[data-gradient-enabled="true"\]\[data-gradient-preset="aurora"\]/ },
  { name: "Ambient preset: ocean-luxe", pattern: /html\[data-gradient-enabled="true"\]\[data-gradient-preset="ocean-luxe"\]/ },
  { name: "Ambient preset: royal", pattern: /html\[data-gradient-enabled="true"\]\[data-gradient-preset="royal"\]/ },
  { name: "Ambient preset: sunset-luxe", pattern: /html\[data-gradient-enabled="true"\]\[data-gradient-preset="sunset-luxe"\]/ },
  { name: "Ambient preset: emerald-luxe", pattern: /html\[data-gradient-enabled="true"\]\[data-gradient-preset="emerald-luxe"\]/ },
  { name: "Ambient preset: cosmic", pattern: /html\[data-gradient-enabled="true"\]\[data-gradient-preset="cosmic"\]/ },
  { name: "Settings hub card laser top", pattern: /\.card-laser-top/ },
  { name: "Settings hub icon badge", pattern: /\.settings-hub-icon-badge/ },
  { name: "Visual systems: Ambient Swiss", pattern: /html\[data-design-style="ambient-swiss"\]/ },
  { name: "Visual systems: Soft Fintech", pattern: /html\[data-design-style="soft-fintech"\]/ },
  { name: "Visual systems: Colour-Block Luxury", pattern: /html\[data-design-style="color-block-luxury"\]/ },
  { name: "Visual systems: Bento Editorial", pattern: /html\[data-design-style="bento-editorial"\]/ },
  { name: "Visual systems: Warm Paper", pattern: /html\[data-design-style="warm-paper"\]/ },
  { name: "Visual systems: Soft Glass", pattern: /html\[data-design-style="soft-glass"\]/ },
  { name: "Visual systems: Dark Anchor", pattern: /html\[data-design-style="dark-anchor"\]/ },
  { name: "Visual systems: Muted Rainbow", pattern: /html\[data-design-style="muted-rainbow"\]/ },
  { name: "Visual systems: Quiet Luxury", pattern: /html\[data-design-style="quiet-luxury"\]/ },
  { name: "Visual systems: Premium Hybrid", pattern: /html\[data-design-style="premium-hybrid"\]/ },
  { name: "Dark mode card background fix", pattern: /html\.dark\[data-gradient-enabled="true"\] \.rounded-2xl\.border/ },
];

let cssPassed = 0;
for (const check of requiredCssChecks) {
  if (check.pattern.test(globalsCss)) {
    console.log(`  ✅ PASS: ${check.name}`);
    cssPassed++;
  } else {
    console.error(`  ❌ FAIL: ${check.name} missing in globals.css`);
  }
}

// 2. Check layout.tsx for hydration script restoring all settings
const layoutCode = readFileSync("app/layout.tsx", "utf8");
const requiredLayoutChecks = [
  { name: "Hydrates dark class with system fallback", pattern: /m==="dark"\|\|\(m==="system"&&window\.matchMedia/ },
  { name: "Hydrates motion-reduce class", pattern: /classList\.toggle\("motion-reduce"/ },
  { name: "Hydrates density-compact class", pattern: /classList\.toggle\("density-compact"/ },
  { name: "Hydrates font-scale-large class", pattern: /classList\.toggle\("font-scale-large"/ },
  { name: "Hydrates data-gradient-enabled", pattern: /setAttribute\("data-gradient-enabled"/ },
  { name: "Hydrates data-gradient-preset", pattern: /setAttribute\("data-gradient-preset"/ },
  { name: "Hydrates contrast-more class", pattern: /classList\.toggle\("contrast-more"/ },
  { name: "Hydrates data-design-style", pattern: /setAttribute\("data-design-style",ds\)/ },
];

let layoutPassed = 0;
for (const check of requiredLayoutChecks) {
  if (check.pattern.test(layoutCode)) {
    console.log(`  ✅ PASS: ${check.name}`);
    layoutPassed++;
  } else {
    console.error(`  ❌ FAIL: ${check.name} missing in layout.tsx`);
  }
}

// 3. Check theme-provider.tsx for complete option sets
const providerCode = readFileSync("components/theme-provider.tsx", "utf8");
const requiredProviderChecks = [
  { name: "6 Accent colors defined", pattern: /ACCENT_PALETTES.*blue.*emerald.*violet.*amber.*rose.*cyan/s },
  { name: "6 Gradient presets defined", pattern: /GRADIENT_PRESETS.*aurora.*ocean-luxe.*royal.*sunset-luxe.*emerald-luxe.*cosmic/s },
  { name: "Density modes defined", pattern: /DensityMode="comfortable"\|"compact"/ },
  { name: "Font scales defined", pattern: /FontScale="standard"\|"large"/ },
  { name: "Motion modes defined", pattern: /MotionMode="on"\|"off"/ },
  { name: "applyTheme applies density-compact", pattern: /classList\.toggle\("density-compact",d==="compact"\)/ },
  { name: "applyTheme applies font-scale-large", pattern: /classList\.toggle\("font-scale-large",f==="large"\)/ },
  { name: "applyTheme applies data-gradient-enabled", pattern: /setAttribute\("data-gradient-enabled",String\(ge\)\)/ },
  { name: "applyTheme applies data-gradient-preset", pattern: /setAttribute\("data-gradient-preset",gp\)/ },
  { name: "applyTheme applies motion-reduce", pattern: /classList\.toggle\("motion-reduce",mo==="off"\)/ },
  { name: "resetToDefaults resets all options", pattern: /resetToDefaults=.*displayMode:"light",gradientEnabled:true,gradientPreset:"aurora"/ },
];

let providerPassed = 0;
for (const check of requiredProviderChecks) {
  if (check.pattern.test(providerCode)) {
    console.log(`  ✅ PASS: ${check.name}`);
    providerPassed++;
  } else {
    console.error(`  ❌ FAIL: ${check.name} missing in theme-provider.tsx`);
  }
}

// 4. Check appearance-panel.tsx for interactive simulator and all control toggles
const panelCode = readFileSync("components/settings/appearance-panel.tsx", "utf8");
const requiredPanelChecks = [
  { name: "Live interactive simulator card present", pattern: /Live Interactive Workspace Simulator/ },
  { name: "Light & Dark display toggles present", pattern: /setDisplayMode\(id as DisplayMode\)/ },
  { name: "6 Brand accent color buttons present", pattern: /ACCENT_PALETTES\.map/ },
  { name: "UI Density buttons (comfortable & compact) present", pattern: /setDensity\(value\)/ },
  { name: "Ambient gradient toggle & presets present", pattern: /setGradientPreset/ },
  { name: "Motion toggle (ON/OFF) present", pattern: /setMotion\("on"/ },
  { name: "Font scale buttons (standard & large) present", pattern: /setFontScale\(value\)/ },
  { name: "Sound feedback toggle present", pattern: /soundFeedback/ },
  { name: "Thermal auto-print toggle present", pattern: /autoPrintThermal/ },
  { name: "High contrast mode toggle present", pattern: /highContrast/ },
  { name: "Reset appearance defaults button present", pattern: /resetToDefaults\(\)/ },
];

let panelPassed = 0;
for (const check of requiredPanelChecks) {
  if (check.pattern.test(panelCode)) {
    console.log(`  ✅ PASS: ${check.name}`);
    panelPassed++;
  } else {
    console.error(`  ❌ FAIL: ${check.name} missing in appearance-panel.tsx`);
  }
}

// Summary
const totalPassed = cssPassed + layoutPassed + providerPassed + panelPassed;
const totalExpected = requiredCssChecks.length + requiredLayoutChecks.length + requiredProviderChecks.length + requiredPanelChecks.length;

console.log(`\n======================================================`);
console.log(`THEME VERIFICATION SUMMARY: ${totalPassed} / ${totalExpected} CHECKS PASSED`);
console.log(`======================================================\n`);

if (totalPassed !== totalExpected) {
  process.exit(1);
}
