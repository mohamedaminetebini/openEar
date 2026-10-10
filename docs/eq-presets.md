# Listening presets

Reviewed 2026-10-10. Choose a preset under **Equalizer → Sound preset**, adjust by ear, and use **Save profile** to keep your version. Saved profiles and preset changes also update system EQ when Desktop audio is active.

These eight additions are original, modest ten-band listening curves. They are informed by the guidance below, not copied measurements or manufacturer recommendations. There is no universal best EQ: the recording, headphone response, fit, and your preference matter. No verified H858 correction was found in the sources checked. Curves for a different headphone model should not be treated as H858 calibration.

| Preset           | When to try it                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Warm and smooth  | A little bass body and softer highs for everyday listening.                                                                                  |
| Dialogue clarity | Speech, podcasts, or dialogue obscured by bass.                                                                                              |
| Bass control     | Boomy low end; cuts only, without extra treble boost.                                                                                        |
| Treble soften    | Sharp cymbals or harsh consonants; mostly cuts upper bands.                                                                                  |
| Electronic       | More bass punch and a small detail lift.                                                                                                     |
| Acoustic detail  | Modest presence and brightness for acoustic instruments.                                                                                     |
| FPS focus        | Less low-end masking with a small presence lift. Does not guarantee better footsteps or positional accuracy and adds no surround processing. |
| Movie night      | Modest bass weight and dialogue presence for films.                                                                                          |

Band order is **31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz**. Values are dB. The authoritative arrays are in [model.ts](../src/features/equalizer/model.ts).

```text
Warm and smooth:  1,  1, 0.5,  0,    0,    0, -0.5, -1,   -2, -1.5
Dialogue clarity:-3, -3,  -2, -1,    0,  0.5,    2,  1,    0,   -1
Bass control:    -2, -3,  -3, -1,    0,    0,    0,  0,    0,    0
Treble soften:    0,  0,   0,  0,    0,    0, -0.5, -1.5, -3,   -2
Electronic:       2,  3,   1,  0,   -1, -0.5,    0,  0.5,  1,  0.5
Acoustic detail: -1,-0.5,  0,  0, -0.5,    0,  0.5,  1,  0.5,  0.5
FPS focus:       -3, -3,  -2, -1, -0.5,    0,    1,  1.5,0.5,   -1
Movie night:    1.5,  2,   1,  0, -0.5,    0,  0.5,  1,    0, -0.5
```

The original Flat, Bass boost, Vocal, Rock, Classical, and Gaming presets remain available. The eight new curves use at most 3 dB boosts/cuts and half-dB steps. Automatic headroom reduces playback gain when bands are boosted; a louder preset is not necessarily better. Compare against Flat at similar listening volume. EQ does not implement compression, normalization, ANC, or spatial audio.

## Research sources and limits

- [AutoEq](https://github.com/jaakkopasanen/AutoEq) generates headphone EQ from measured frequency responses and chosen targets. Its model-specific curves require the appropriate measurement and filter configuration. No AutoEq curve or target is represented by these presets.
- [RTINGS: How to EQ your headphones](https://www.rtings.com/headphones/learn/how-to-eq-your-headphones) explains bass/treble adjustments, target matching, and headphone-specific EQ. This supports the approach; it does not endorse our exact gain values.
- [Shure MV6G2 guide](https://www.shure.com/en-US/docs/guide/mv6g2) describes reducing lower frequencies or adjusting mids for vocal clarity. It concerns microphone DSP, so its principle is used as a listening experiment, not a validated headphone correction.

The exact numbers are authored here and remain adjustable. H858 measurements and controlled, level-matched listening would be needed to validate a model-specific recommendation.
