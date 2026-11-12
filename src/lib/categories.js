// Who someone is to you, and the rhythm and way of reaching them that suggests. Mirrors
// default_cadence_for() and default_style_for() in the database, which fill these in if
// the app doesn't. Kept apart from api.js so pure code and tests can use it.

export const CATEGORIES = ['family', 'friend', 'abroad', 'mentor']

export const CATEGORY_LABEL = {
  family: 'Family',
  friend: 'Friend',
  abroad: 'Friend who lives far away',
  mentor: 'Mentor',
}

export const DEFAULT_CADENCE = {
  friend: 60,
  mentor: 90,
  family: 30,
  abroad: 45,
}

export const DEFAULT_STYLE = {
  friend: 'hang',
  mentor: 'check_in',
  family: 'call',
  abroad: 'check_in',
}
