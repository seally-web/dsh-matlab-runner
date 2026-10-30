/**
 * Resolve hook for the host-half test: the app runtime provides
 * `@deepseek-ai/dsh-tools`, a plain `node` process does not, so map it to a
 * local fixture that returns the definition object untouched.
 */
export async function resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-tools') {
    return { url: new URL('./fixtures/dsh-tools.mjs', import.meta.url).href, shortCircuit: true }
  }
  return next(specifier, context)
}
