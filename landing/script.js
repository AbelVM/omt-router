document.addEventListener('DOMContentLoaded', function () {
  // set --vh for mobile browsers to provide a safe 100vh fallback
  function setVh() {
    var vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
    var header = document.querySelector('.site-header');
    var headerHeight = header ? Math.round(header.getBoundingClientRect().height) + 'px' : '0px';
    document.documentElement.style.setProperty('--site-header-height', headerHeight);
  }
  setVh();
  window.addEventListener('resize', setVh, { passive: true });

  var navToggle = document.getElementById('menu-toggle');
  var navMenu = document.getElementById('primary-nav');
  var faqButtons = document.querySelectorAll('.faq-item');

  if (navToggle) {
    if (navMenu) {
      // ensure initial aria state matches markup
      var navInitExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navMenu.setAttribute('aria-hidden', navInitExpanded ? 'false' : 'true');

      navToggle.addEventListener('click', function () {
        var isOpen = navMenu.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        navMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      });

      // Close the menu with Escape and return focus to the toggle
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          if (navMenu.classList.contains('open')) {
            navMenu.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            navToggle.focus();
          }
        }
      });

      // Close the menu when a navigation link is selected (single-page anchors)
      var navLinks = navMenu.querySelectorAll('a');
      if (navLinks.length) {
        navLinks.forEach(function (link) {
          link.addEventListener('click', function () {
            if (navMenu.classList.contains('open')) {
              navMenu.classList.remove('open');
              navToggle.setAttribute('aria-expanded', 'false');
              navMenu.setAttribute('aria-hidden', 'true');
            }
          });
        });
      }
    } else {
      // Fallback: toggle aria-expanded if nav exists in markup but menu element is missing
      navToggle.addEventListener('click', function () {
        var isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      });
    }
  }

  faqButtons.forEach(function (button) {
    var answer = button.nextElementSibling;
    button.addEventListener('click', function () {
      var isActive = button.classList.toggle('active');
      var toggle = button.querySelector('.faq-toggle');
      if (toggle) toggle.textContent = isActive ? '−' : '+';
      if (answer) {
        answer.style.display = isActive ? 'block' : 'none';
      }
      button.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
  });

  // Scroll hint: show a subtle animated cue after brief inactivity
  (function () {
    var scrollHint = document.getElementById('scroll-hint');
    if (!scrollHint) return;

    var hintTimeout = null;
    var interacted = false;
    var INACTIVITY_MS = 2500;

    function hideScrollHint() {
      scrollHint.classList.remove('visible');
      scrollHint.classList.add('hidden');
      scrollHint.setAttribute('aria-hidden', 'true');
    }

    function showScrollHint() {
      // ensure any lingering 'hidden' class is removed before showing
      scrollHint.classList.remove('hidden');
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        scrollHint.classList.add('visible');
        scrollHint.setAttribute('aria-hidden', 'false');
        return;
      }
      requestAnimationFrame(function () {
        scrollHint.classList.add('visible');
        // start listening for mouse movement only after the hint is visible
        postShowInteractionEvents.forEach(function (ev) { window.addEventListener(ev, onUserInteraction, { passive: true }); });
      });
      scrollHint.setAttribute('aria-hidden', 'false');
    }

    function onUserInteraction(e) {
      // ignore synthetic events (script-dispatched) so initialization scroll doesn't cancel the hint
      if (e && e.isTrusted === false) return;
      interacted = true;
      if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout = null; }
      hideScrollHint();
      removeInteractionListeners();
    }

    var initialInteractionEvents = ['scroll','touchstart','wheel','keydown','mousedown','pointerdown'];
    var postShowInteractionEvents = ['mousemove'];

    function removeInteractionListeners() {
      initialInteractionEvents.concat(postShowInteractionEvents).forEach(function (ev) {
        window.removeEventListener(ev, onUserInteraction, { passive: true });
      });
    }

    function addInteractionListeners() {
      // Do not treat small mouse moves as interaction before the hint is shown.
      initialInteractionEvents.forEach(function (ev) {
        window.addEventListener(ev, onUserInteraction, { passive: true });
      });
    }

    addInteractionListeners();
    hintTimeout = setTimeout(function () { if (!interacted) showScrollHint(); }, INACTIVITY_MS);

    // Hide as soon as the user starts scrolling (ignore synthetic scroll events)
    window.addEventListener('scroll', function onScrollForHint(e) {
      if (e && e.isTrusted === false) return;
      hideScrollHint();
      removeInteractionListeners();
      window.removeEventListener('scroll', onScrollForHint);
    }, { passive: true });

    // Clicking the hint smooth-scrolls slightly down and hides the hint
    scrollHint.addEventListener('click', function () {
      window.scrollTo({ top: window.innerHeight * 0.95, behavior: 'smooth' });
      hideScrollHint();
      removeInteractionListeners();
    });
  })();

  // Animations: reveal + subtle hero parallax (respect prefers-reduced-motion)
  if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    var selectors = 'h1,h2,h3,.hero-copy,.feature-card,.usecase-card,.panel-content,.code-block,.control-card';
    document.querySelectorAll(selectors).forEach(function (el) { el.classList.add('reveal'); });
    // staggers: set small per-element CSS delay using --reveal-delay
    document.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.setProperty('--reveal-delay', (i * 20) + 'ms');
    });

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

    var heroVisuals = document.querySelectorAll('.hero-visual');
    if (heroVisuals.length) {
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(function () {
            heroVisuals.forEach(function (el) {
              var rect = el.getBoundingClientRect();
              var offset = ((rect.top + rect.height / 2) - (window.innerHeight / 2)) / window.innerHeight;
              if (offset > 1) offset = 1; if (offset < -1) offset = -1;
              el.style.transform = 'translateY(' + (offset * 10) + 'px)';
            });
            ticking = false;
          });
        }
      }, { passive: true });
      window.dispatchEvent(new Event('scroll'));
    }
  }

  if (window.lucide) {
    var iconOptions = {
      selector: 'i[data-lucide]',
      width: 20,
      height: 20,
      strokeWidth: 2.2,
    };

    if (typeof lucide.createIcons === 'function') {
      lucide.createIcons(iconOptions);
    } else if (typeof lucide.replace === 'function') {
      lucide.replace(iconOptions);
    }
  }
});
