'use client';

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

export default function AuthScreen({ configurationError = '', recovery = false, onRecoveryComplete }) {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (recovery) setMode('reset');
  }, [recovery]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'reset') {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage('Your password has been updated.');
        onRecoveryComplete?.();
      } else if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage(data.session
          ? 'Your account is ready. You can continue to SplitSmart.'
          : 'Check your email for a verification link, then sign in.');
        if (!data.session) setMode('sign-in');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    setMessage('');
    setError('');
    if (!email.trim()) {
      setError('Enter your email address first, and then request a password reset.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setMessage('If an account exists for that email, a password reset link is on its way.');
    } catch (resetError) {
      setError(resetError.message || 'Could not request a password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="brand auth-brand" href="/" aria-label="SplitSmart home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="brand-name">split<span>smart</span></span>
        </a>
        <div className="auth-heading">
          <span className="auth-kicker">YOUR GROUP, IN SYNC</span>
          <h1 id="auth-title">{configurationError ? 'Finish your setup' : mode === 'reset' ? 'Choose a new password' : mode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h1>
          <p>{configurationError
            ? 'Supabase configuration needs attention before you can continue.'
            : mode === 'reset'
              ? 'Choose a secure password for your SplitSmart account.'
            : mode === 'sign-up'
              ? 'Create an account to keep shared expenses secure and in sync.'
              : 'Sign in to access your saved expenses.'}</p>
        </div>
        {configurationError ? (
          <div className="auth-error" role="alert">{configurationError}</div>
        ) : (
          <>
            {message && <div className="auth-success" role="status">{message}</div>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <form className="auth-form" onSubmit={submit}>
              <label className="field-label">Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label className="field-label">Password
                <input
                  type="password"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </label>
              <button className="button-primary auth-submit" type="submit" disabled={submitting}>
                {submitting ? 'Please wait…' : mode === 'reset' ? 'Update password' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>
            {mode === 'sign-in' && (
              <button className="auth-link reset-link" type="button" onClick={resetPassword} disabled={submitting}>
                Forgot your password?
              </button>
            )}
            {mode !== 'reset' && (
              <div className="auth-switch">
                {mode === 'sign-up' ? 'Already have an account?' : 'New to SplitSmart?'}
                <button
                  className="auth-link"
                  type="button"
                  onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setMessage(''); }}
                >
                  {mode === 'sign-up' ? 'Sign in' : 'Create account'}
                </button>
              </div>
            )}
          </>
        )}
        <p className="auth-footnote">Your account is secured by Supabase Authentication.</p>
      </section>
    </main>
  );
}
