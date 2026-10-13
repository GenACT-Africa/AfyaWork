/** Home page for each role after sign-in. */
export function dashboardFor(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'facility') return '/facility/dashboard';
  if (role === 'coordinator') return '/coordinator';
  return '/co/dashboard';
}
