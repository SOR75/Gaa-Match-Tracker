The legacy-cache-first-sw.js fixture is the unmodified service-worker source from
physically tested commit e687719c273f46f25f2bc101136117686373b0c2.
Browser tests substitute its existing build/precache placeholders and serve the
real current production app with an older HTML title. A switchable HTTP server
models deployment updates; no browser route or service-worker mock is used.
All match/squad records in these tests are isolated representative test data.
