# 闸 C：全新 clone 复验

时间：2026-11-13 11:20（北京）
命令：`git clone` → `npm ci` → `bash scripts/verify.sh`

```
Ba Zhuang verification (full)
---------------------------------------------------------
node available                                     PASS
npm available                                      PASS
typescript type check                              PASS
simulation unit checks                             PASS
production build                                   PASS
dist/index.html exists                             PASS
asset paths are relative                           PASS
MIT licence present                                PASS
README has run instructions                        PASS
docs/00-BRIEF.md                                   PASS
docs/01-SPEC.md                                    PASS
docs/04-PROOF.md                                   PASS
docs/05-SUBMISSION.md                              PASS
docs/07-UI.md                                      PASS
no api keys committed                              PASS
no external URLs in the bundle                     PASS
browser end-to-end (25 checks)                     PASS
---------------------------------------------------------
all checks passed
```
