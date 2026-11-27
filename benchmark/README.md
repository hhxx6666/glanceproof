# Blind tabletop benchmark

Six held-out synthetic scenes cover two occlusions, two sets of similar objects and two absent targets. The model receives the question and the captured JPEG views through GlanceProof’s regular decision endpoint. It starts at Center and can request Left or Right. The answer digit and supporting views stay in the evaluator. The scenes are generated illustrations.

Set `OPENAI_API_KEY` in the environment or the repository’s `.env`. Optionally set `OPENAI_MODEL` to evaluate a specific model.

```sh
node benchmark/run.mjs > benchmark-report.json
```

The JSON includes each case’s decision sequence, visited views, outcome and aggregate counts.

| Metric | Counted when | Denominator |
| --- | --- | --- |
| `correctAnswer` | The digit matches and every citation is to a view that shows it | 4 answerable cases |
| `correctAbstention` | The model returns `uncertain` on a scene with no target | 2 absent-target cases |
| `wrongFrame` | An answer cites a frame without the target digit | All answers, including answers on absent-target scenes |

A repeated move or a move after the last capture is recorded as `unfinished`. API failures are `error`. The local tests verify the evaluation logic with scripted decisions. Use the live command above to measure a model.
