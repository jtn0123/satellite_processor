/**
 * JTN-417: Tiny className composer.
 *
 * Hand-rolled instead of pulling in `clsx` + `tailwind-merge` so we don't
 * grow the bundle for a helper that is only ever fed string / boolean
 * expressions. Accepts strings, booleans (ignored), null, or undefined and
 * joins the truthy strings with a single space.
 *
 * For Tailwind usage, write your utility classes so that later arguments
 * override earlier ones (rightmost wins) — callers compose the list in the
 * order they want resolution.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  let out = '';
  for (const v of values) {
    if (!v) continue;
    if (out) out += ' ';
    out += v;
  }
  return out;
}
