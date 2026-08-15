import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(
      pathToFileURL(`${process.cwd()}/src/${specifier.slice(2)}.ts`).href,
      context,
    );
  }
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
