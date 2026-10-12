/*
 * Draft or queue a player on ESPN's own draft-room page, as if you clicked it
 * yourself: find the player's row and click its DRAFT (or QUEUE) button. If
 * the player isn't on screen, type his name into ESPN's player search first.
 * Only ever runs when you press the button in the panel.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const PANEL = '#hoops-draft-assistant';

  function nameMatches(text, name) {
    const t = HDA.normalizeName(text);
    if (!t || t.length > 60) return false;
    const full = HDA.normalizeName(name);
    const toks = full.split(' ');
    const initial = toks.length > 1 ? toks[0][0] + ' ' + toks.slice(1).join(' ') : null;
    return t === full || (initial && t === initial);
  }

  /** The DRAFT/QUEUE button in the same row as the player's name. */
  function findActionButton(doc, name, want) {
    const nameEls = [];
    for (const el of doc.querySelectorAll('a, span, div, td, button, p')) {
      if (el.closest(PANEL) || el.children.length > 3) continue;
      if (nameMatches(el.textContent || '', name)) nameEls.push(el);
    }
    for (const el of nameEls) {
      let node = el;
      for (let i = 0; i < 8 && node && node !== doc.body; i++, node = node.parentElement) {
        const btns = [...node.querySelectorAll('button, a[role="button"], [role="button"]')].filter((b) => !b.closest(PANEL) && want.test((b.textContent || '').trim()));
        if (btns.length === 1) return btns[0];
        if (btns.length > 1) break; // reached a container holding several rows: wrong level
      }
    }
    return null;
  }

  function findSearchBox(doc) {
    return [...doc.querySelectorAll('input[type="search"], input[type="text"], input:not([type])')]
      .find((i) => !i.closest(PANEL) && /player/i.test(i.placeholder || i.getAttribute('aria-label') || '')) || null;
  }

  /** Set an input's value so React-style pages notice it. */
  function typeInto(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * @param {Document} doc
   * @param {{name:string}} player
   * @param {'draft'|'queue'} kind
   * @returns {Promise<{ok:boolean, message:string}>}
   */
  async function espnDraftAction(doc, player, kind) {
    const want = kind === 'draft' ? /^draft$/i : /^(queue|\+ ?queue|add to queue)$/i;
    const verb = kind === 'draft' ? 'DRAFT' : 'QUEUE';
    let btn = findActionButton(doc, player.name, want);
    let typed = null;
    if (!btn) {
      let input = findSearchBox(doc);
      if (!input) {
        // The search box lives on ESPN's "Players" tab.
        const tab = [...doc.querySelectorAll('button, a, [role="tab"], li, span')].find((el) => !el.closest(PANEL) && /^\s*players\s*$/i.test(el.textContent || ''));
        if (tab) { tab.click(); await wait(400); input = findSearchBox(doc); }
      }
      if (input) {
        typed = input;
        typeInto(input, player.name);
        for (let i = 0; i < 25 && !btn; i++) { await wait(150); btn = findActionButton(doc, player.name, want); }
      }
    }
    if (!btn) {
      return {
        ok: false,
        message: typed
          ? `Couldn't find ${player.name}'s ${verb} button. His name is in ESPN's search box, so click ${verb} there.`
          : `Couldn't find ${player.name}'s ${verb} button on ESPN's page. Use ESPN's player list for this pick.`,
      };
    }
    btn.click();
    if (typed) { await wait(250); typeInto(typed, ''); }
    return { ok: true, message: kind === 'draft' ? `Sent DRAFT for ${player.name} to ESPN.` : `Added ${player.name} to your ESPN queue.` };
  }

  Object.assign(HDA, { espnDraftAction, findActionButton });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
