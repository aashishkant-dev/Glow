// mobile/src/data/skinQuiz.ts
// Mirrors src/utils/skinAnalysis.js's QUIZ_QUESTIONS on the backend exactly —
// ids and choice ids must match, since the server scores skin type from
// whatever choice ids this quiz sends back. Same duplication precedent as
// CATEGORIES (src/utils/categories.js / mobile/src/data/categories.ts):
// static content kept in sync by convention rather than a network round trip.

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
    id: 'tightness',
    question: 'A few hours after washing, how does your skin feel?',
    choices: [
      { id: 'tight', label: 'Tight or flaky' },
      { id: 'comfortable', label: 'Comfortable, balanced' },
      { id: 'shiny', label: 'Shiny all over' },
      { id: 'varies', label: 'Depends on the area' },
    ],
  },
  {
    id: 'midday_shine',
    question: 'By midday, how does your T-zone (forehead, nose, chin) look?',
    choices: [
      { id: 'very_shiny', label: 'Very shiny' },
      { id: 'slightly_shiny', label: 'Slightly shiny' },
      { id: 'matte', label: 'Still matte' },
      { id: 'no_change', label: 'No real change' },
    ],
  },
  {
    id: 'sensitivity',
    question: 'Does your skin react to new products (redness, itching, stinging)?',
    choices: [
      { id: 'often', label: 'Often' },
      { id: 'sometimes', label: 'Sometimes' },
      { id: 'rarely', label: 'Rarely or never' },
    ],
  },
  {
    id: 'pores',
    question: 'How visible are your pores, especially around the nose?',
    choices: [
      { id: 'very_visible', label: 'Very visible' },
      { id: 'somewhat', label: 'Somewhat visible' },
      { id: 'barely', label: 'Barely visible' },
    ],
  },
];
