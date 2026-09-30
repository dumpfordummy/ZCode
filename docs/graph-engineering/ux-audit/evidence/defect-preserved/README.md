# Preserved evidence: stale check-save error beside Review and run

Found by native journey C (step C4) on the Desktop build made **before** the fix (source `d88a914` plus a working tree without the fix; renderer built 2026-09-30 16:38).

- Screenshot (in this repository): `../screenshots/defect-prefix-build-failed-save-beside-review-1280x720.png` shows the red message "Project recipe configuration changed; reload before saving." under **Review and run** after **Back to new run**.
- The native receipt for that run (`stale-check-save-error-prefix-build/receipt.json`, observation `visible: true`) and the failing browser-suite log (`ux-m1-browser.mjs`: 29 passed, 1 failed, before the fix) are kept **locally** and are not uploaded (they embed full Graph records and machine paths).

The fixed build removes the message from the New-run bar; see `../../UX_M1_WINDOWS_REPORT.md` section 5.
