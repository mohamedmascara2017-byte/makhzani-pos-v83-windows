---
name: Expo auth redirects
description: Avoid blank initial screens when redirecting from local-session authentication.
---

When authentication depends on asynchronously restored local state, keep the Expo Router root navigator mounted and perform redirects after mount rather than returning a root-level redirect before the navigator exists.

**Why:** A local PIN login flow showed a blank web preview when the root auth guard attempted to redirect before the root stack had mounted.

**How to apply:** Hydrate the session first, render the root stack, then redirect from an effect or route-level guard once navigation is available.
