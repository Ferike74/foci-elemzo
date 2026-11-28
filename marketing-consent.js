/* Optional Meta measurement. No Meta request is made before an explicit opt-in. */
(() => {
    'use strict';
    const PIXEL_ID = '2152583985624270';
    const STORAGE_KEY = 'foci_marketing_consent_v1';
    const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
    const ALLOWED_QUERY_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid']);
    let choice = null;
    let initialized = false;
    let pageViewed = false;
    let checkoutTracked = false;
    let panel;

    function safeAddress(value) {
        try {
            const url = new URL(value);
            if (!['/', '/index.html'].includes(url.pathname) || url.hash) return false;
            for (const [key, val] of url.searchParams) {
                if (!ALLOWED_QUERY_KEYS.has(key) || val.length > 1000 || /[@<>\r\n]|%40/i.test(val)) return false;
            }
            return true;
        } catch { return false; }
    }
    // Capture this before the authentication/checkout handlers clean the address.
    // Never expose password reset tokens, email addresses or Stripe session IDs to Meta.
    const safeLanding = safeAddress(window.location.href)
        && (!document.referrer || safeAddress(document.referrer));
    const publicHost = ['www.focielemzesek.com', 'focielemzesek.com'].includes(window.location.hostname);

    function readChoice() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (value?.version !== 1 || typeof value.marketing !== 'boolean' || !Number.isFinite(value.decidedAt)) return null;
            const age = Date.now() - value.decidedAt;
            return age >= 0 && age < MAX_AGE_MS ? value.marketing : null;
        } catch { return null; }
    }
    function saveChoice(allowed) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, marketing: allowed, decidedAt: Date.now() }));
        } catch { /* A blocked local store must never prevent using the site. */ }
    }
    function clearMetaCookies() {
        const host = window.location.hostname;
        const domains = ['', host, '.' + host, 'focielemzesek.com', '.focielemzesek.com'];
        for (const name of ['_fbp', '_fbc']) {
            for (const domain of domains) {
                document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax; Secure' + (domain ? '; Domain=' + domain : '');
            }
        }
    }
    function eventId() {
        return 'foci-' + (window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    }
    function startPixel() {
        if (choice !== true || !publicHost || !safeLanding || !safeAddress(window.location.href)) return false;
        if (!initialized) {
            if (!window.fbq) {
                const queue = function () {
                    queue.callMethod ? queue.callMethod.apply(queue, arguments) : queue.queue.push(arguments);
                };
                queue.push = queue; queue.loaded = true; queue.version = '2.0'; queue.queue = [];
                window.fbq = queue;
                if (!window._fbq) window._fbq = queue;
            }
            window.fbq('consent', 'grant');
            window.fbq('set', 'autoConfig', false, PIXEL_ID);
            // Automatic advanced matching remains off: no email, name or account data is passed.
            window.fbq('init', PIXEL_ID);
            initialized = true;
            const script = document.createElement('script');
            script.id = 'foci-meta-pixel-sdk'; script.async = true;
            script.referrerPolicy = 'no-referrer';
            script.src = 'https://connect.facebook.net/en_US/fbevents.js';
            document.head.appendChild(script);
        }
        if (!pageViewed) {
            window.fbq('trackSingle', PIXEL_ID, 'PageView', {}, { eventID: eventId() });
            pageViewed = true;
        }
        return true;
    }
    function setChoice(allowed) {
        const wasInitialized = initialized;
        choice = allowed;
        saveChoice(allowed);
        window.dispatchEvent(new CustomEvent("foci:marketing-consent", {detail:{allowed}}));
        panel.hidden = true;
        if (allowed) startPixel();
        else {
            if (initialized && typeof window.fbq === 'function') window.fbq('consent', 'revoke');
            clearMetaCookies();
            // End the loaded SDK's lifetime when consent is withdrawn.
            if (wasInitialized) window.location.reload();
        }
        const button = document.getElementById('marketing-settings-button');
        if (document.activeElement && panel.contains(document.activeElement)) button?.focus({ preventScroll: true });
    }
    function openSettings() {
        panel.hidden = false;
        panel.querySelector('button')?.focus();
    }
    function trackCheckout() {
        try {
            if (checkoutTracked || !startPixel()) return false;
            window.fbq('trackSingle', PIXEL_ID, 'InitiateCheckout', { num_items: 1 }, { eventID: eventId() });
            checkoutTracked = true;
            return true;
        } catch { return false; }
    }
    function boot() {
        panel = document.createElement('section');
        panel.id = 'foci-marketing-consent';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-labelledby', 'foci-marketing-title');
        panel.innerHTML = '<h2 id="foci-marketing-title">Engedélyezed a hirdetések mérését?</h2>'
            + '<p>Hozzájárulásoddal a Meta sütiket használhat, és adatot kaphat az oldal meglátogatásáról, illetve a regisztrációs folyamat elindításáról. Saját kampánymérésünk legfeljebb 30 napig összekötheti a látogatást a regisztrációddal, a próba állapotával és az igazolt előfizetési fizetéssel. Ezzel mérjük közösségi kampányaink eredményét; a saját összerendelés adatait nem adjuk át a Metának. Az oldal elutasítás esetén is használható.</p>'
            + '<a href="/sutik.html" target="_blank" rel="noopener noreferrer">Részletek a sütikről és az adatkezelésről</a>'
            + '<div class="foci-marketing-actions"><button type="button" data-choice="reject">Elutasítom</button><button type="button" data-choice="accept">Elfogadom</button></div>';
        document.body.appendChild(panel);
        panel.querySelector('[data-choice="accept"]').addEventListener('click', () => setChoice(true));
        panel.querySelector('[data-choice="reject"]').addEventListener('click', () => setChoice(false));
        document.getElementById('marketing-settings-button')?.addEventListener('click', openSettings);
        choice = readChoice();
        panel.hidden = choice !== null;
        if (choice === true) startPixel();
        else clearMetaCookies();
        window.addEventListener('storage', event => {
            if (event.key !== STORAGE_KEY && event.key !== null) return;
            const fresh = readChoice();
            if (initialized && fresh !== true) {
                window.fbq('consent', 'revoke');
                clearMetaCookies();
                window.location.reload();
                return;
            }
            choice = fresh;
            panel.hidden = choice !== null;
            if (choice === true) startPixel();
        });
        window.FociMarketing = Object.freeze({ openSettings, trackCheckout, hasConsent: () => choice === true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
