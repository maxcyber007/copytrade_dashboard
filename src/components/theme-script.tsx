/**
 * Applies the persisted theme before first paint to avoid a flash.
 * Kept inline (and tiny) on purpose — it must run before hydration.
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
