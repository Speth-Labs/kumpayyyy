# Design QA

## Comparison target

- Source visual truth: `C:/Users/LUTFIS~1/AppData/Local/Temp/codex-clipboard-e0af2467-852d-477e-8883-87599931ea92.jpg`
- Implementation URL: `http://localhost:3000/`
- Implementation capture: Codex in-app browser capture, reviewed at 838 x 698 CSS pixels (the browser capture is inline and was not persisted as a separate image file).
- Source dimensions: 380 x 359 pixels.
- State: final photo monogram after the LUMIN intro and love animation; audio player loaded with the sound toggle enabled.

## Full-view comparison evidence

The source is a compact black monogram with a high Y, a lower-right L, and a diagonal slash crossing the two letters. Per the latest direction, the implementation now intentionally keeps only the Y silhouette: two photo arms and one photo stem. The dark, quiet background keeps the single-letter collage readable without adding a competing panel.

## Focused-region comparison evidence

The central monogram was reviewed at full browser scale. The previous separated L/Y layout was simplified to three connected Y strokes, with no L or diagonal section. Each stroke uses parallel photo lanes so the full collection stays dense while individual images remain visible. The love state was also reviewed separately; it now uses a filled heart lattice instead of a loose radial ring, so the middle is visibly occupied and the silhouette is easy to recognize.

The latest iteration was checked at the same 838 x 698 viewport: the Y junction is centered, both arms open evenly, and the lower stem is isolated from the removed L/diagonal structure. The love state uses rounded stepped lobes, a clear upper notch, a filled body, and a single tapered point. The overall pass also reduces placement jitter, restores a little photo color, and adds a restrained canvas shadow/center halo so the composition sits more intentionally in the scene.

The playlist state was also captured at the same viewport. By default it is only a small lower-left pill showing the active track, so the monogram remains unobstructed. Tapping the pill expands the glass panel with all three choices plus previous/next controls; the active row is visually distinct and the separate sound toggle remains in the lower-right corner.

## Required fidelity surfaces

- Fonts and typography: the reference's serif wordmark is intentionally not reproduced as text; the user's requested photos remain the visible letter material. The LUMIN intro keeps the existing lightweight display treatment.
- Spacing and layout rhythm: the three Y strokes use equal card scale, parallel lanes, and bounded path spacing so the mark stays full without photo overlap.
- Colors and visual tokens: the existing dark teal memory palette and restrained vignette remain unchanged so the source's high-contrast monogram mood is preserved.
- Image quality and asset fidelity: all 64 supplied memory images remain loaded once across 32 front and 32 back cards. Texture preparation keeps fixed footprints, high smoothing, and the existing fallback placeholder for failed loads.
- Copy and content: the intro remains LUMIN; the playlist identifies Gala Bunga Matahari, Rehat, and Rumpang with their artists and keeps the active selection readable without occupying the scene by default.

## Audio and runtime checks

- The YouTube player receives the current origin and retries on the first user interaction instead of treating a blocked autoplay attempt as successful.
- Browser autoplay policy can still prevent unmuted audio on a brand-new page load. The sound toggle was tested: disabling and re-enabling it changes the embedded player to an active state.
- Browser console error/warning capture: no new errors after the final playlist patch; the player still loads with its origin-aware embed URL.
- Local route response: HTTP 200.

## Comparison history

1. Earlier pass: L and Y were visibly separated, and the love intro had a looser ring of photos.
2. Fix: replaced the layout with an interlocked Y/L path system and a checkerboard-filled heart target.
3. Verification: final browser capture shows the connected monogram and a dense, readable heart; no runtime errors were reported.
4. Latest iteration: raised the Y junction and endpoints, shortened its stem, and reshaped the love target with a protected notch plus taller proportions. The browser capture shows a clearly recognizable heart and a more elevated Y; runtime logs remain clean.
5. Final polish pass: shortened the Y stem to match the reference monogram, lowered the L entry, tightened the diagonal crossing, and rebuilt the heart rows for rounder lobes and a cleaner point. The final browser capture shows the intended Y/L relationship and a readable heart; runtime logs remain clean.
6. Overall polish pass: reduced card jitter and rotation, improved the restrained photo grade, brought the diagonal forward at crossings, and refined the background halo/vignette plus canvas shadow. The latest capture preserves the reference relationship while making the memory wall feel more deliberate; runtime logs remain clean.
7. Playlist pass: added three official online tracks with a compact selectable panel, previous/next controls, active-state styling, and a preserved sound toggle. Rehat and Rumpang were selected in-browser and each loaded its corresponding YouTube player before the default track was restored; runtime logs remained clean.
8. Playlist focus pass: collapsed the selector to a small pill by default, added an accessible expand/collapse control, and verified the expanded list plus the closed state in-browser without covering the monogram.
9. Letter separation pass: gave the Y and L distinct photo lanes, lowered the diagonal accent behind them, and checked the settled monogram in-browser so neither letter's photos are hidden by the other.
10. Y-only pass: removed the L and diagonal paths, redistributed all 32 photos into two upper Y arms plus one lower stem, and verified the final Y after the intro animation settled.
11. Three-reload debug pass: checked the intro, transition, settled Y, and a canvas tap across three fresh reloads. All 64 supplied images returned to the final Y without missing textures or browser console errors; the repeated renderer warning is limited to the development HMR session with multiple open tabs.
12. Mobile performance pass: kept the same 64-photo Y composition while capping mobile rendering at a 1x drawing buffer, reducing texture preparation to one cover pass, lowering the back-face blur kernel, spacing texture work across a smaller queue, and removing mobile-only canvas/control blur effects. Production build, lint, HTTP 200, and the settled browser preview all passed with no new browser errors.
13. Relaxed love pass: preserved the recognizable notch, filled body, and tapered point while adding a bounded shared sway, curved row lift, and restrained per-card tilt. The love preview now feels hand-placed and calm instead of grid-like; the final Y still settles correctly and browser logs remain clean.
14. Relaxed Y pass: added a shallow organic curve to the arms and stem, kept the center stem upright instead of rotating it by π, and varied card angles with a small bounded wave so the photos no longer look uniformly flipped. The final browser capture keeps the Y immediately recognizable; lint, build, HTTP 200, and browser logs remain clean.
15. Curve emphasis pass: increased the arm bow and the stem's gentle S-curve so the Y reads relaxed at a glance instead of merely tilted. The latest settled preview retains clear separation between cards and no new runtime errors.
16. Straighter Y pass: removed the visible path curvature, tightened the stem lanes, and raised the stem junction so the center reads as one fuller connection instead of a hole. Relaxed photo angles remain, while the final Y stays clean and recognizable.
17. Stylized junction pass: narrowed the stem only at its upper junction while preserving equal row timing, then added a small alternating along-path stagger and tilt pattern. The center stays compact without reopening a hole, and the straight Y now has its own editorial rhythm.
18. Spacing pass: extended each straight stroke outward from the junction and widened the arm lanes, creating a much more breathable gap between memories while keeping every supplied photo and the Y silhouette intact. The local preview remains within the viewport with clean browser logs.
19. Density adjustment: pulled the stroke stretch back from the wide spacing pass and returned the arm lanes closer together, preserving a readable gap while making the full Y feel more connected and compact.
20. Soft Wave pass: added a low-amplitude, phase-shifted cross-axis motion per photo with a tiny rotation companion. The straight Y remains stable while nearby memories breathe in sequence; two preview captures separated by 2.2 seconds showed the motion and browser logs stayed clean.

## Findings

No actionable P0, P1, or P2 visual findings remain for the requested photo-monogram treatment. The serif glyph in the source is an intentional reference for the silhouette; the implementation correctly substitutes the user's memory photos as the visible medium.

## Follow-up polish

- P3: If fully automatic audible playback is required, provide a licensed local audio file or accept a browser-native “tap to enable sound” step; browsers do not allow websites to bypass unmuted autoplay policy reliably.

## Implementation Checklist

- [x] Photo-only Y monogram implemented.
- [x] L and diagonal paths removed per the latest direction.
- [x] Y strokes use separate photo lanes so the images remain readable.
- [x] Love intro filled and made more legible.
- [x] Texture/photo loading path checked.
- [x] Audio origin and first-interaction fallback fixed.
- [x] Three-track online playlist with selection and previous/next controls tested.
- [x] Playlist collapsed by default so it does not compete with the photo composition.
- [x] Mobile rendering path reduced without changing the Y layout or photo count.
- [x] Lint and production build pass.
- [x] Browser preview and runtime logs checked.

final result: passed
