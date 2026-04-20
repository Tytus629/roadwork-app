const fs = require("fs");
const path = require("path");

const targets = [
  path.join(__dirname, "..", "node_modules", "tsconfig.packages.base.json"),
  // Fallback for tools that resolve from the @react-native-firebase scope root.
  path.join(__dirname, "..", "node_modules", "@react-native-firebase", "tsconfig.packages.base.json"),
];

const content = {
  compilerOptions: {
    strict: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: true,
  },
};

const crashlyticsTsconfigPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native-firebase",
  "crashlytics",
  "tsconfig.json",
);

function ensureCrashlyticsTsconfig() {
  if (!fs.existsSync(crashlyticsTsconfigPath)) return;

  try {
    const raw = fs.readFileSync(crashlyticsTsconfigPath, "utf8");
    const parsed = JSON.parse(raw);

    // Remove monorepo-only parent file dependency that is missing in published package.
    if (parsed.extends) {
      delete parsed.extends;
    }

    parsed.compilerOptions = {
      ...(parsed.compilerOptions ?? {}),
      strict: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
    };

    fs.writeFileSync(crashlyticsTsconfigPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    console.log(`[postinstall] Updated ${crashlyticsTsconfigPath}`);
  } catch (error) {
    console.warn("[postinstall] Unable to patch crashlytics tsconfig", error);
  }
}

try {
  for (const target of targets) {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, `${JSON.stringify(content, null, 2)}\n`, "utf8");
      console.log(`[postinstall] Created ${target}`);
    } else {
      // Keep file fresh if dependency manager restored an older placeholder.
      fs.writeFileSync(target, `${JSON.stringify(content, null, 2)}\n`, "utf8");
      console.log(`[postinstall] Updated ${target}`);
    }
  }

  ensureCrashlyticsTsconfig();
} catch (error) {
  console.warn("[postinstall] Unable to ensure tsconfig.packages.base.json", error);
}
