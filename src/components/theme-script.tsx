/**
 * Dark is the default, so the server already renders <html class="dark"> and
 * this script only has to take the class off for visitors who explicitly chose
 * light. Removing a class that is already in the markup cannot flash; adding
 * one after paint can.
 *
 * Kept inline (and tiny) on purpose — it must run before hydration.
 */
export function ThemeScript() {
  const script = `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
