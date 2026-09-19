/* ============================================================================
   DIBSEN Ridge — the real Raja Ampat skyline.

   Not invented and not sculpted: built from 1,920 real elevation samples taken
   from the SRTM 30 m dataset over Waigeo and Batanta, covering
     lon 130.05°E – 131.15°E  (about 122 km)
     lat   0.05°S –   0.95°S  (about 100 km)
   The archipelago's own coordinate motif, 0°14′S 130°E, sits inside this box.

   WHY REAL DATA IS USED HERE AND NOWHERE ELSE
   A DEM is a height field — one elevation per (x, y) — so it can never hold an
   overhang, and the wave-cut notch at the waterline of a karst islet IS an
   overhang. It is the single most recognisable feature of these islands. So
   the hero islands stay hand-sculpted in Blender, and real elevation data is
   used only for the distant ridge, where the land is kilometres wide, no notch
   is resolvable at any distance the camera ever reaches, and 30 m sampling is
   more than enough.

   Three profiles = three latitude bands of the source grid, nearest first:
     0  Waigeo         peak  738 m
     1  the channel    peak  267 m   (mostly open water — a real gap, kept)
     2  Batanta        peak 1040 m
   Each profile is the MAX elevation across its band's rows, which preserves a
   true skyline; averaging would have flattened every peak away. One light
   3-tap smoothing pass follows, because 30 m data sampled at ~1.1 km spacing
   is jagged — that smooths the line without inventing peaks the data lacks.

   Values are metres above sea level; 0 is sea.
   ========================================================================== */
window.DIBSEN_RIDGE = {
  peak: 1040,
  layers: [
    [0,0,0,24,78,131,206,247,159,53,10,20,40,50,115,139,55,0,6,12,21,67,138,239,322,293,217,157,132,172,202,145,81,101,180,272,329,372,428,443,422,413,386,358,390,437,452,426,364,358,423,472,441,342,312,357,332,235,131,108,154,170,205,338,459,397,260,292,482,656,726,712,683,622,493,426,431,380,363,466,563,598,648,713,738,682,580,526,462,357,323,356,438,565,603,522],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,55,100,123,148,203,238,226,177,152,186,202,176,186,249,267,199,106,36,10,56,148,200,200,193,173,137,173,231,188,110,107,184,212,192,201,158,99,83,47,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,21,67,107,65,92,276,360,277,193,132,159,241,263,319,406,418,540,837,1040,1038,936,829,681,515,458,420,327,326,417,433,370,293,201,149,196,288,379,487,556,494,341,254,248,205,147,119,122,146,142,126,109,82,64,52,34,22,17,7,0,0,0,0,0,0,0]
  ]
};
