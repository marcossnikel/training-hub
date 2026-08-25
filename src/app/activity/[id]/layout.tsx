/**
 * Gives the detail page and its nested evidence routes a shared segment. This
 * lets the nested route's real loading boundary replace only the content pane
 * during client navigation while the surrounding application shell stays live.
 */
export default function ActivityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
