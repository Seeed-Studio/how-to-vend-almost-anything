// Shared GA4 tag for the production GitHub Pages site only.
(() => {
  const sitePath = '/how-to-vend-almost-anything/';
  if (window.location.hostname !== 'seeed-studio.github.io' ||
      !window.location.pathname.startsWith(sitePath) ||
      document.getElementById('project-ga4')) {
    return;
  }

  const measurementId = 'G-KLLL5BL462';
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId);

  const tag = document.createElement('script');
  tag.id = 'project-ga4';
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  document.head.appendChild(tag);
})();
