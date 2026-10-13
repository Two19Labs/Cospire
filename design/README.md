# Design reference

`cospire-lms-prototype.html` is the Client-approved visual prototype. It is a
**reference, never shipped**, and nothing in `src/` imports from this folder.

Open it in a browser to see the intended design. It renders standalone.

## What it is, and why none of it was copied

It is a visual-builder export, not source: React 18 UMD pulled from unpkg, PNG
assets base64-encoded into a `__bundler/manifest` block, and the markup escaped
inside a `__bundler/template` string.

The part that decided the approach: **423 inline `style` attributes and zero CSS
classes.** There is no stylesheet to import and no component to reuse. Copying
the markup would have put 423 hardcoded style attributes into Server Components
and thrown away the semantic class structure the application already has.

So the design was **read** rather than imported. The values in
`src/app/globals.css` were derived by counting what the prototype actually uses,
which is why the token set is small — one shadow, six radii, one ink colour with
opacity ramps. That restraint is the design.

## What was extracted

| | |
|---|---|
| Ink | `#182b50`, plus opacity ramps at 35/45/55/70% for quieter text |
| Paper | `#faf5e6` page, `#f1ead2` deep, `#fdf0e0` warm, `#ffffff` cards |
| Accents | rust `#b5471f`, gold `#ffc24b`, sage `#7e9682` |
| Lines | ink at 6%, 10% and 20% — never a grey |
| Radii | 4 · 6 · 8 · 12 · 14 · 999 |
| Shadow | one only: `0 1px 2px rgb(24 43 80 / 6%)`, used 46 times unvaried |
| Labels | uppercase at `.06em`, used 42 times — the design's signature |

There is deliberately **no green and no red**. Sage and rust carry those
meanings, which is what keeps the palette warm.

## Fonts

**Inter, body and headings.** The Client chose it on 2026-10-12 over the
prototype's Figtree body and Recoleta headings, which they found tiring to read
and less professional for an LMS. It is self-hosted through `next/font/google`
in `src/app/layout.tsx` (weights 400 to 700), and `--font-serif`, the heading
token, points at it too.

Figtree is no longer loaded, and the Recoleta Bold files the prototype named are
no longer owed by the Client.

## Colours

**The prototype's own colours, kept by the Client on 2026-10-12**: the ink rail,
cream page, white cards, gold for the current item and progress, rust for
emphasis and danger. A near-white sidebar with a rust accent was shown as the
alternative and declined, for consistency with Cospire's videos and brand
material. The card shape of 2026-10-10 stays: 20px outer cards with no border,
16px inner cards with a 2px rule, no shadows, pill primary buttons.

## Scope: the prototype shows more than the agreement covers

It depicts screens for phases not yet built, which is useful. It also depicts
three things that appear nowhere in Annexure A:

- a **study streak** counter
- **"mocks attempted" / "average score"** dashboard statistics
- a **"View as"** role switcher, which is impersonation

Build the design's *look* without absorbing its *scope*. Each of those is a
change request under clause 12 if the Client wants it, and none should arrive
silently because it was in a picture.
