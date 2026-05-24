/*
 * CMSData — fetches and reshapes the site's CMS payload (metadata,
 * contact info, and the projects list) from the Active Theory v6 CMS
 * bucket. Wires the result up to the Router and Data layers so views
 * can request `workItems` and react to slug navigation.
 *
 * Boot sequence (async IIFE):
 *   1. Wait for Hydra to be ready.
 *   2. `createBigJson()` fetches metadata/contact/projects in series
 *      from GCS (`activetheory-v6.appspot.com/cms/<key>-<latest|dev>.json`),
 *      using `?v=CMS_DATA_<now>` for a cache-bust. Existing
 *      `window.CMS_DATA[key]` is honored so multiple ViewControllers
 *      sharing a page don't re-fetch.
 *   3. Register a `workItems` request handler with the Data layer.
 *      Returns the live `_workPages` StateArray if populated, else
 *      a fresh StateArray of mock data (provided by Data).
 *   4. Flag `isReady` so `await self.ready()` resolves.
 *
 * Data version selection:
 *   `dataVersion` is `'latest'` in production (`window.PROD`), `'dev'`
 *   otherwise. The CMS publishes two parallel files per slug — content
 *   editors work against the `dev` file until they cut a release.
 *
 * Project reshape (`reshape(data, index)`):
 *   Maps the raw CMS schema onto the engine's expected fields. Notable
 *   transforms:
 *     • `date` is a 3-line composite string used by the gallery's
 *       multi-line text element: "YYYY\nClient\ntags".
 *     • `color` defaults to `'dddddd'` if `uiColor` is missing; LOCAL
 *       builds log a warning so authors notice the omission.
 *     • `tags` is lowercased once here so downstream filters can use
 *       simple `includes()`.
 *   `cleanup(data)` strips CMS bookkeeping (`id`, `createdAt`, etc.)
 *   from non-project payloads before exposing them on `window.CMS_DATA`.
 *
 * Routing reactions:
 *   `Router/state` is the broadcast channel for the active route. The
 *   binding here implements the work-gallery deep link:
 *     • `work/<slug>` → look up the matching project and ensure it's
 *       in `_workPages` at index 0 (so it's the first card visible).
 *       To keep the gallery size stable, the last current entry is
 *       evicted on push.
 *     • `work` (gallery root) → trigger a delayed `reflow()` if this is
 *       the first navigation, so the gallery rebalances after the
 *       initial render. Subsequent visits skip the reflow.
 *   `_lastRoute` records the prior value so the gallery only reflows
 *   on the very first visit.
 *
 * AI / chat hook:
 *   `CMSData/slug` carries `{slug, message}` payloads from the AI
 *   answer pipeline. When a matching project exists, stash a response
 *   pre-merged with the AI body and navigate to the project. The
 *   detail view will then ask `CMSData/readyForResponse` once it's
 *   mounted, and the stashed body is delivered via
 *   `WorkDetailContent/updateText`.
 *
 * QR deep-link (`?workids=…&roomqr=…`):
 *   In showroom / on-site QR scenarios the URL specifies an explicit
 *   ordered subset of projects to show. The handler intersects the
 *   id list with `_workData` and replaces `_workPages` with that
 *   exact, ordered slice — bypassing the default shuffle.
 *
 * `filter(tag)`:
 *   Replace `_workPages` with up to 14 shuffled projects matching the
 *   given tag. The UI's tag chips wire to this.
 */
Class(function CMSData() {
  Inherit(this, Model);
  const self        = this;
  const _data       = {};
  const dataVersion = window.PROD ? 'latest' : 'dev';

  let _workPages = new StateArray();
  let _workData  = [];
  let _lastRoute = '';

  // Boot: fetch JSON, install the Data handler for workItems, flag ready.
  (async () => {
    await Hydra.ready();
    await self.createBigJson();
    Data.handleRequest('workItems', (data, mockData) =>
      _workPages.length ? _workPages : new StateArray(mockData()),
    );
    self.flag('isReady', true);
  })();

  /*
   * Route reaction:
   *   work/<slug> — surface that project as the first card. We remove
   *     the gallery's tail entry to keep the displayed count stable.
   *   work       — first-visit reflow (delayed 400ms so the layout
   *     calculation runs after the gallery's intro animation).
   */
  AppState.bind('Router/state', (val) => {
    if (val.includes('work/')) {
      const slug    = val.replace('work/', '');
      const project = _workData.find((elem) => elem.perma === slug);
      if (project && !_workPages.includes(project)) {
        _workPages.remove(_workPages[_workPages.length - 1]);
        _workPages.insertAtIdx(0, project);
      }
    } else if ('work' === val && !_lastRoute) {
      self.delayedCall((_) => _workPages.reflow(), 400);
    }
    _lastRoute = val;
  });

  // AI/chat response wiring. The slug binding stashes the response; the
  // readyForResponse binding flushes it once the detail view is mounted.
  let response = {};
  AppState.bind('CMSData/slug', ({ slug, message }) => {
    const project = _workData.find((elem) => elem.perma === slug);
    if (!project) return;
    response = { ...project, body: message, ai: true };
    AppState.set('ViewController/navigate', `work/${slug}`);
  });
  AppState.bind('CMSData/readyForResponse', (_) => {
    if (response.body) {
      AppState.set('WorkDetailContent/updateText', response, true);
      response = {};
    }
  });

  // Tag-filtered gallery (up to 14 shuffled matches).
  self.filter = function (tag) {
    _workPages.refresh(
      _workData
        .filter((element) => element.tags.includes(tag))
        .shuffle()
        .slice(0, 14),
    );
  };

  // Strip CMS bookkeeping fields from a payload before exposing it.
  self.cleanup = function (data) {
    const { id, createdAt, updatedAt, globalType, ...cleaned } = data;
    return cleaned;
  };

  /*
   * Map the raw CMS project record onto the engine's expected shape.
   * `date` is the 3-line composite the gallery text element renders;
   * `color` falls back to a neutral grey if uiColor is missing.
   */
  self.reshape = function (data, index) {
    const dateString = `${new Date(data.completionDate).getFullYear()}\n${data.clientName}\n${data.tags.toLowerCase()}`;
    if (!data.uiColor && Hydra.LOCAL) console.log('Color Missing', data.name);
    return {
      seo:          data.name,
      title:        data.name,
      subhead:      data.description,
      priority:     data.priority,
      color:        data.uiColor || 'dddddd',
      date:         dateString,
      projectLogo:  data.projectLogo,
      clientName:   data.clientName,
      body:         data.description,
      perma:        data.slug,
      caseStudyURL: data.caseStudyURL,
      projectURL:   data.projectURL,
      videoURL:     data.video.url,
      thumbnailURL: data.video.thumbnail,
      tags:         data.tags.toLowerCase(),
      index,
    };
  };

  /*
   * Fetch metadata/contact/projects from GCS sequentially. The cache
   * mirror on `window.CMS_DATA` lets multiple controllers share the
   * payload across hot reloads / re-init.
   *
   * `projects` is the heavy one: sort by `priority` ascending, default
   * gallery is a shuffled 14-item slice, but a `?workids=…&roomqr=…`
   * query overrides that with an explicit ordered subset for showroom
   * QR deep-links.
   */
  self.createBigJson = async function () {
    const pages = ['metadata', 'contact', 'projects'];
    window.CMS_DATA = window.CMS_DATA || {};

    for await (const key of pages) {
      if (window.CMS_DATA[key]) {
        _data[key] = window.CMS_DATA[key];
        continue;
      }
      const data = await get(
        `/assets/data/cms/${key}.json?v=CMS_DATA_${Date.now()}`,
      ).catch((e) => console.log(e));
      if (!data) continue;

      if ('projects' === key) {
        _workData = data
          .map((page, index) => self.reshape(page, index))
          .sort((a, b) => a.priority - b.priority);
        window.CMS_DATA.projects = _workData;
        _workPages.refresh([..._workData.slice(0, 14).shuffle()]);

        // Showroom QR deep-link: explicit ordered subset.
        const workids = Utils.query('workids');
        if (workids && Utils.query('roomqr')) {
          const ids = workids.split(',');
          const newList = [];
          ids.forEach((id) => {
            const match = _workData.find((item) => item.index === parseInt(id));
            if (match) newList.push(match);
          });
          _workPages.refresh(newList);
        }
        self.workPages = _workPages;
      } else {
        window.CMS_DATA[key] = self.cleanup(data);
        _data[key] = data;
      }
    }
  };

  self.ready = async function () {
    await self.wait('isReady');
  };
}, 'static');
