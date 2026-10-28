---
title: DMC situation report and NBRO landslide PDFs (pypdf parsing)
author: Tharaka
date: 2026-10-28
branch: worktree-agent-a13f17de25d0ddd1f
touches:
  - backend/app/services/bulletins.py
---

## Decided
- Sources: dmc.gov.lk com_dmcreports listing, report_type_id=1 (Situation Report, mixed with "Drought Situation Report" rows; skip those) and report_type_id=5 (Landslide Warning: NBRO "LEWM" PDFs).
- Sitrep: each "District Total" row extracts as one line of exactly 12 integers in the order families, people, deaths, injured, missing, houses fully, partially, SME, infrastructure, safe locations, safe-location families, persons. The column order was checked against the header x positions. The last 12-integer line is the GRAND TOTAL. parsed_ok requires the districts to add up to it.
- Landslide: the level is the table column, and extract_text() loses it. Use visitor_text x positions and assign each fragment to the nearest header (District / Level 1 / 2 / 3). District names are vertically centred in their cells, so sort by content order, not by y. Cells continue across pages.
## Watch out
- Real PDFs are 0.5 MB, mostly embedded fonts, and remove_images doesn't shrink them. The test fixtures are the extracted text and fragments instead.
- The DMC spellings Rathnapura, Killinochchi and Mulaitivu map to the lib/districts.ts names.
