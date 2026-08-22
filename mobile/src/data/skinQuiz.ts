// mobile/src/data/skinQuiz.ts
// Down to the one question a photo genuinely can't answer. This used to be
// 4 fixed questions (tightness, midday shine, sensitivity, pores) feeding
// the free pixel-math heuristic — now that the real Gemini vision path
// (src/utils/geminiSkinAnalysis.js) reads tone/type/texture directly from
// the photo, asking someone to also describe their own T-zone shine by hand
// was redundant. Sensitivity is the one genuine exception: a single still
// photo can't reliably show how skin REACTS over time, so it's worth still
// asking. Id/choice ids must match src/utils/skinAnalysis.js's
// QUIZ_QUESTIONS and src/routes/skin.js's SENSITIVITY_HINTS exactly.

export interface SkinQuizChoice {
  id: string;
  label: string;
}

export interface SkinQuizQuestion {
  id: string;
  question: string;
  choices: SkinQuizChoice[];
}

export const SKIN_QUIZ_QUESTIONS: SkinQuizQuestion[] = [
  {
    id: 'sensitivity',
    question: 'Does your skin react to new products (redness, itching, stinging)?',
    choices: [
      { id: 'often', label: 'Often' },
      { id: 'sometimes', label: 'Sometimes' },
      { id: 'rarely', label: 'Rarely or never' },
    ],
  },
];
