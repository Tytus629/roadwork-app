/**
 * Guards that release bundles strip console.* calls.
 * Metro sets BABEL_ENV=production for non-dev bundles, which enables
 * babel-plugin-transform-remove-console via babel.config.js env.production.
 */
const path = require('path');
const babel = require('@babel/core');

function compile(envName) {
  return babel.transformSync('console.log("x"); doWork();', {
    cwd: path.resolve(__dirname, '..'),
    filename: path.resolve(__dirname, '..', 'probe.js'),
    envName,
    babelrc: false,
    configFile: path.resolve(__dirname, '..', 'babel.config.js'),
  }).code;
}

describe('babel console stripping', () => {
  it('removes console calls in production', () => {
    const out = compile('production');
    expect(out).not.toMatch(/console\./);
    expect(out).toMatch(/doWork\(\)/);
  });

  it('keeps console calls in development', () => {
    expect(compile('development')).toMatch(/console\.log/);
  });
});
