/**
 * Key-screen strings in English and isiZulu. Sentence case, plain verbs, one job per string.
 * isiZulu strings are first drafts for the hackathon and should be reviewed by a
 * fluent speaker before launch.
 */
export const LOCALES = ['en', 'zu'] as const;
export type Locale = (typeof LOCALES)[number];

const en = {
  brand: 'iskole',
  heroTitle: 'Your next step after matric, in one place.',
  heroBody:
    'iskole matches you to courses you qualify for, compares funding options, helps you apply and keeps you on track with a study plan.',
  getStarted: 'Create your account',
  signIn: 'Sign in',
  placeholderTitle: 'This part arrives in the next milestone.',
  sampleDataFooter: 'Sample, verify before use',

  // Auth screens
  emailLabel: 'Email address',
  passwordLabel: 'Password',
  nameLabel: 'Your name',
  dateOfBirthLabel: 'Date of birth',
  dateOfBirthHint: 'You must be 16 or older to use iskole.',
  signInTitle: 'Welcome back',
  signUpTitle: 'Create your account',
  signInPrompt: 'Already have an account? Sign in',
  signUpPrompt: 'New to iskole? Create an account',
  passwordHint: 'At least 12 characters. A short sentence works well.',
  consentLabel:
    'I agree that iskole may store my information to match me to courses and funding.',
  submitSignIn: 'Sign in',
  submitSignUp: 'Create account',
  checkInboxTitle: 'Check your email',
  checkInboxBody:
    'We sent you a link to confirm your email address. Open it to finish setting up your account.',
  verifyTitle: 'Confirming your email',
  verifySuccess: 'Your email is confirmed. You can sign in now.',
  verifyFailed: 'That link has expired or was already used. Request a new one from the sign-in screen.',
  resetTitle: 'Reset your password',
  resetRequestBody: 'Enter your email and we will send you a reset link.',
  resetSubmit: 'Send reset link',
  resetDoneTitle: 'Check your email',
  resetDoneBody: 'If that address has an iskole account, a reset link is on its way.',
  newPasswordLabel: 'New password',
  resetSubmitNew: 'Save new password',
  genericAuthError: 'That did not work. Check your details and try again.',
  dashboardGreeting: 'Welcome',
  dashboardIntro:
    'Your account is ready. Next you will add your subjects and marks so we can work out your APS and match you to courses.',
} as const;

export type DictionaryKey = keyof typeof en;
export type Dictionary = Record<DictionaryKey, string>;

const zu: Dictionary = {
  brand: 'iskole',
  heroTitle: 'Okwakho emva kwemathric, endaweni eyodwa.',
  heroBody:
    'iskole ikudingisa izifundo ozifanelekayo, iqhathanisa izinketho zezimali, ikusiza ukuthi ufake izicelo futhi ikugcinele uhlelo lokufunda.',
  getStarted: 'Dala i-akhawunti yakho',
  signIn: 'Ngena ngemigomo',
  placeholderTitle: 'Lokhu kuzofika esikhathini esizayo.',
  sampleDataFooter: 'Ikhophi yesampula, qinisekisa ngaphambi kokusebenzisa',

  emailLabel: 'Ikheli le-imeyili',
  passwordLabel: 'Iphasiwedi',
  nameLabel: 'Igama lakho',
  dateOfBirthLabel: 'Usuku lokuzalwa',
  dateOfBirthHint: 'Kufanele ube neminyaka eyi-16 noma ngaphezulu ukuze usebenzise i-iskole.',
  signInTitle: 'Wamukelekile futhi',
  signUpTitle: 'Dala i-akhawunti yakho',
  signInPrompt: 'Usunayo i-akhawunti? Ngena',
  signUpPrompt: 'Umusha ku-iskole? Dala i-akhawunti',
  passwordHint: 'Okungenani izinhlamvu eziyi-12. Umusho omfishane wanele.',
  consentLabel:
    'Ngiyavuma ukuthi i-iskole igcine ulwazi lwami ukuze ingidibanise nezifundo nemali yokufunda.',
  submitSignIn: 'Ngena',
  submitSignUp: 'Dala i-akhawunti',
  checkInboxTitle: 'Hlola i-imeyili yakho',
  checkInboxBody:
    'Sikuthumelele isixhumanisi sokuqinisekisa ikheli lakho le-imeyili. Sivule ukuze uqedele i-akhawunti yakho.',
  verifyTitle: 'Siqinisekisa i-imeyili yakho',
  verifySuccess: 'I-imeyili yakho iqinisekisiwe. Ungangena manje.',
  verifyFailed:
    'Leso sixhumanisi siphelelwe yisikhathi noma sasisetshenzisiwe. Cela esisha esikrinini sokungena.',
  resetTitle: 'Setha kabusha iphasiwedi yakho',
  resetRequestBody: 'Faka i-imeyili yakho sizokuthumelela isixhumanisi sokusetha kabusha.',
  resetSubmit: 'Thumela isixhumanisi',
  resetDoneTitle: 'Hlola i-imeyili yakho',
  resetDoneBody: 'Uma lelo kheli linayo i-akhawunti ye-iskole, isixhumanisi siyeza.',
  newPasswordLabel: 'Iphasiwedi entsha',
  resetSubmitNew: 'Gcina iphasiwedi entsha',
  genericAuthError: 'Lokho akusebenzanga. Hlola imininingwane yakho bese uzama futhi.',
  dashboardGreeting: 'Siyakwamukela',
  dashboardIntro:
    'I-akhawunti yakho isilungile. Okulandelayo uzofaka izifundo zakho namamaki ukuze sibale i-APS yakho futhi sikudibanise nezifundo.',
};

export function getDict(locale: Locale): Dictionary {
  return locale === 'zu' ? zu : en;
}
