export type Locale = 'en' | 'he'

const dictionaries = {
  en: {
    testExecutions: 'Test Executions',
    passed: 'Passed',
    failed: 'Failed',
    remediated: 'Remediated',
    noLogsAvailable: 'No logs available.',
    remediationApplied: 'Remediation Applied',
    enhancePrompt: 'Enhance Prompt',
  },
  he: {
    testExecutions: 'תוצאות בדיקות',
    passed: 'עבר',
    failed: 'נכשל',
    remediated: 'תוקן אוטומטית',
    noLogsAvailable: 'אין לוגים זמינים.',
    remediationApplied: 'תיקון הופעל',
    enhancePrompt: 'שדרג הנחיה',
  },
}

export const getDictionary = (locale: Locale) => {
  return dictionaries[locale] || dictionaries.en
}
