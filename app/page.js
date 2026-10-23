'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthScreen from './auth-screen';
import { supabase, supabaseConfigurationError } from './lib/supabase';

const SEED = [
  { id: 'seed-1', emoji: '🍽️', name: 'Dinner', paidBy: 'Aisha', amount: 1800 },
  { id: 'seed-2', emoji: '🚕', name: 'Cab', paidBy: 'Raj', amount: 400 },
];

const inr = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function localDateString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

const iconPaths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  down: <path d="m7 10 5 5 5-5" />,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
};

function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}

function parseExpense(text) {
  const amountMatch = text.match(/\d[\d,]*(\.\d+)?/);
  const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
  const name = text.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
  return {
    id: `e-${Date.now()}`,
    emoji: '🧾',
    name: name.charAt(0).toUpperCase() + name.slice(1),
    paidBy: 'You',
    amount,
  };
}

function formatDate(value) {
  if (!value) return 'Recently added';
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function mapExpense(row) {
  return {
    id: row.id,
    createdBy: row.user_id,
    name: row.name,
    emoji: row.emoji || '🧾',
    paidBy: row.paid_by,
    amount: Number(row.amount),
    category: row.category || 'Other',
    date: row.expense_date || row.created_at?.slice(0, 10) || '',
  };
}

export default function Home() {
  const [expenses, setExpenses] = useState(supabase ? [] : SEED);
  const [quickText, setQuickText] = useState('');
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(!supabase);
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupsReady, setGroupsReady] = useState(!supabase);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupModal, setGroupModal] = useState('');
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [storageError, setStorageError] = useState(supabaseConfigurationError);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [todayLabel, setTodayLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTodayLabel(new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date()).toUpperCase());

    if (supabaseConfigurationError) {
      setReady(true);
      return undefined;
    }

    if (supabase) {
      let active = true;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setGroupsReady(!session?.user);
        }
        setUser((currentUser) =>
          currentUser?.id === session?.user?.id ? currentUser : session?.user || null
        );
        setAuthChecked(true);
        if (!session) {
          setGroups([]);
          setActiveGroup(null);
          setGroupsReady(true);
          setExpenses([]);
          setReady(true);
        }
      });

      supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setStorageError(`Could not restore your Supabase session: ${error.message}`);
        }
        setUser(data.session?.user || null);
        setGroupsReady(!data.session);
        setAuthChecked(true);
        if (!data.session) setReady(true);
      }).catch((error) => {
        if (!active) return;
        setStorageError(`Could not connect to Supabase: ${error.message || 'Check your connection and try again.'}`);
        setAuthChecked(true);
        setGroupsReady(true);
        setReady(true);
      });

      return () => {
        active = false;
        subscription.unsubscribe();
      };
    }

    try {
      const saved = localStorage.getItem('splitsmart.expenses');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error('Saved expense data is not a list.');
        setExpenses(parsed);
      }
    } catch {
      setStorageError('Saved expenses could not be read. Your current list is still available for this session.');
    }
    setReady(true);
    return undefined;
  }, []);

  useEffect(() => {
    if (!ready || supabase || supabaseConfigurationError) return;
    try {
      localStorage.setItem('splitsmart.expenses', JSON.stringify(expenses));
      setStorageError('');
    } catch {
      setStorageError('Changes could not be saved in this browser. Check available storage and try again.');
    }
  }, [expenses, ready]);

  useEffect(() => {
    if (!supabase || !user) {
      if (supabase) {
        setGroups([]);
        setActiveGroup(null);
        setGroupsReady(true);
      }
      return undefined;
    }

    let active = true;
    setGroupsReady(false);
    supabase
      .from('groups')
      .select('id, name, description, currency, join_code, created_by, archived, created_at')
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setStorageError(`Could not load your groups: ${error.message}`);
          setGroups([]);
          setActiveGroup(null);
        } else {
          const availableGroups = data || [];
          let savedGroupId = null;
          let preferenceWarning = '';
          try {
            savedGroupId = localStorage.getItem(`splitsmart.activeGroup.${user.id}`);
          } catch {
            preferenceWarning = 'Your groups loaded, but this browser could not remember your selected group.';
          }
          const selectedGroup =
            availableGroups.find((group) => group.id === savedGroupId) ||
            availableGroups[0] ||
            null;
          setGroups(availableGroups);
          setActiveGroup(selectedGroup);
          if (selectedGroup) {
            try {
              localStorage.setItem(`splitsmart.activeGroup.${user.id}`, selectedGroup.id);
            } catch {
              preferenceWarning = 'Your groups loaded, but this browser could not remember your selected group.';
            }
          }
          setStorageError(preferenceWarning);
        }
        setGroupsReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setStorageError(`Could not reach Supabase while loading groups: ${error.message || 'Check your connection and try again.'}`);
        setGroups([]);
        setActiveGroup(null);
        setGroupsReady(true);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!supabase || !user || !groupsReady) return undefined;
    if (!activeGroup) {
      setExpenses([]);
      setReady(true);
      return undefined;
    }

    let active = true;
    setReady(false);

    supabase
      .from('expenses')
      .select('id, user_id, group_id, name, emoji, paid_by, amount, category, expense_date, created_at')
      .eq('group_id', activeGroup.id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setStorageError(`Could not load expenses from Supabase: ${error.message}`);
        } else {
          setExpenses((data || []).map(mapExpense));
          setStorageError('');
        }
        setReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setStorageError(`Could not reach Supabase: ${error.message || 'Check your connection and try again.'}`);
        setReady(true);
      });

    return () => {
      active = false;
    };
  }, [user, activeGroup, groupsReady]);

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const average = expenses.length ? Math.round((total / expenses.length) * 100) / 100 : 0;
  const contributors = useMemo(() => {
    const totals = new Map();
    expenses.forEach((expense) => {
      const payer = expense.paidBy || 'You';
      totals.set(payer, (totals.get(payer) || 0) + Number(expense.amount || 0));
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const visibleExpenses = expenses.filter((expense) =>
    `${expense.name} ${expense.paidBy}`.toLowerCase().includes(query.toLowerCase())
  );

  const saveExpense = async (expense) => {
    if (!supabase) {
      setExpenses((list) => [expense, ...list]);
      return true;
    }

    if (!activeGroup) {
      setStorageError('Create or join a group before adding an expense.');
      return false;
    }

    if (!user) {
      setStorageError('Sign in before saving an expense.');
      return false;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          group_id: activeGroup.id,
          name: expense.name,
          emoji: expense.emoji || '🧾',
          paid_by: expense.paidBy || user.email || 'You',
          amount: expense.amount,
          category: expense.category || 'Other',
          expense_date: expense.date || localDateString(),
        })
        .select('id, user_id, group_id, name, emoji, paid_by, amount, category, expense_date, created_at')
        .single();

      if (error) {
        setStorageError(`Could not save the expense: ${error.message}`);
        return false;
      }
      setExpenses((list) => [mapExpense(data), ...list]);
      setStorageError('');
      return true;
    } catch (error) {
      setStorageError(`Could not reach Supabase: ${error.message || 'Check your connection and try again.'}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addQuickExpense = async () => {
    const text = quickText.trim();
    if (!text) return;
    const expense = parseExpense(text);
    if (!expense.amount || !Number.isFinite(expense.amount)) {
      setFormError('Add an amount to save this expense. Try “Groceries 850”.');
      setModalOpen(true);
      setQuickText('');
      return;
    }
    if (await saveExpense(expense)) setQuickText('');
  };

  const addExpense = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const amount = Number(form.get('amount'));
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter a description and an amount greater than zero.');
      return;
    }
    const category = String(form.get('category') || 'Other');
    const emojiByCategory = { Food: '🍽️', Travel: '🚕', Home: '🏠', Shopping: '🛍️', Other: '🧾' };
    const saved = await saveExpense({
      name,
      amount,
      paidBy: String(form.get('paidBy') || user?.email || 'You'),
      category,
      date: String(form.get('date') || ''),
      emoji: emojiByCategory[category] || '🧾',
    });
    if (!saved) return;
    setFormError('');
    setModalOpen(false);
  };

  const removeExpense = async (id) => {
    if (!supabase) {
      setExpenses((list) => list.filter((expense) => expense.id !== id));
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .select('id')
        .single();
      if (error) {
        setStorageError(`Could not delete the expense: ${error.message}`);
      } else if (data) {
        setExpenses((list) => list.filter((expense) => expense.id !== data.id));
        setStorageError('');
      }
    } catch (error) {
      setStorageError(`Could not reach Supabase: ${error.message || 'Check your connection and try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) setStorageError(`Could not sign out: ${error.message}`);
  };

  const rememberGroup = (groupId) => {
    if (!user) return;
    try {
      localStorage.setItem(`splitsmart.activeGroup.${user.id}`, groupId);
    } catch {
      setStorageError('Group selected, but this browser could not remember your selection.');
    }
  };

  const selectGroup = (group) => {
    setActiveGroup(group);
    setExpenses([]);
    setReady(false);
    setGroupPickerOpen(false);
    setQuery('');
    rememberGroup(group.id);
  };

  const createGroup = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || !user) return;

    setGroupBusy(true);
    setGroupError('');
    try {
      const { data, error } = await supabase
        .from('groups')
        .insert({ name, created_by: user.id })
        .select('id, name, description, currency, join_code, created_by, archived, created_at')
        .single();

      if (error) {
        setGroupError(`Could not create group: ${error.message}. Confirm you ran the latest supabase/schema_hour6.sql.`);
        return;
      }

      setGroups((currentGroups) => [data, ...currentGroups]);
      setActiveGroup(data);
      setExpenses([]);
      setReady(false);
      rememberGroup(data.id);
      setGroupName('');
      setGroupModal('');
      setGroupPickerOpen(false);
    } catch (error) {
      setGroupError(`Could not reach Supabase while creating the group: ${error.message || 'Check your connection and try again.'}`);
    } finally {
      setGroupBusy(false);
    }
  };

  const joinGroup = async (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setGroupBusy(true);
    setGroupError('');
    try {
      const { data: groupId, error: joinError } = await supabase.rpc('join_group', { code });
      if (joinError) {
        setGroupError(`Could not join group: ${joinError.message}`);
        return;
      }

      const { data, error } = await supabase
        .from('groups')
        .select('id, name, description, currency, join_code, created_by, archived, created_at')
        .eq('id', groupId)
        .single();

      if (error) {
        setGroupError(`You joined, but the group could not be loaded: ${error.message}`);
        return;
      }

      setGroups((currentGroups) => [
        data,
        ...currentGroups.filter((group) => group.id !== data.id),
      ]);
      setActiveGroup(data);
      setExpenses([]);
      setReady(false);
      rememberGroup(data.id);
      setJoinCode('');
      setGroupModal('');
    } catch (error) {
      setGroupError(`Could not reach Supabase while joining the group: ${error.message || 'Check your connection and try again.'}`);
    } finally {
      setGroupBusy(false);
    }
  };

  const copyJoinCode = async () => {
    if (!activeGroup?.join_code) return;
    try {
      await navigator.clipboard.writeText(activeGroup.join_code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch (error) {
      setStorageError(`Could not copy the invitation code: ${error.message || 'Clipboard access was denied.'}`);
    }
  };

  if (supabaseConfigurationError) {
    return <AuthScreen configurationError={supabaseConfigurationError} />;
  }

  if (supabase && !authChecked) {
    return <main className="auth-page"><p className="auth-loading" role="status">Checking your secure session…</p></main>;
  }

  if (supabase && recoveryMode) {
    return <AuthScreen recovery onRecoveryComplete={() => setRecoveryMode(false)} />;
  }

  if (supabase && !user) return <AuthScreen />;
  if (supabase && user && (!groupsReady || (activeGroup && !ready))) {
    return <main className="auth-page"><p className="auth-loading" role="status">Loading your groups and expenses…</p></main>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="SplitSmart home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="brand-name">split<span>smart</span></span>
        </a>

        {supabase ? (
          <>
            <button
              className="workspace-switcher"
              type="button"
              aria-label={`Current group: ${activeGroup?.name || 'No group selected'}`}
              aria-expanded={groupPickerOpen}
              onClick={() => setGroupPickerOpen((open) => !open)}
            >
              <span className="workspace-icon">{activeGroup?.name?.slice(0, 1).toUpperCase() || '+'}</span>
              <span className="workspace-copy">
                <strong>{activeGroup?.name || 'Choose a group'}</strong>
                <small>{activeGroup ? `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} available` : 'No group selected'}</small>
              </span>
              <Icon name="down" size={15} className="workspace-chevron" />
            </button>
            {groupPickerOpen && (
              <div className="group-picker" role="menu" aria-label="Switch group">
                <span className="group-picker-label">YOUR GROUPS</span>
                {groups.map((group) => (
                  <button
                    className={`group-picker-item ${activeGroup?.id === group.id ? 'selected' : ''}`}
                    type="button"
                    role="menuitem"
                    key={group.id}
                    onClick={() => selectGroup(group)}
                  >
                    <span className="group-picker-avatar">{group.name.slice(0, 1).toUpperCase()}</span>
                    <span>{group.name}</span>
                    {activeGroup?.id === group.id && <span className="group-picker-check">✓</span>}
                  </button>
                ))}
                {!groups.length && <p className="group-picker-empty">Create a group or join one with an invite code.</p>}
                <div className="group-picker-actions">
                  <button type="button" onClick={() => { setGroupError(''); setGroupName(''); setGroupModal('create'); setGroupPickerOpen(false); }}>
                    <Icon name="plus" size={14} /> Create group
                  </button>
                  <button type="button" onClick={() => { setGroupError(''); setJoinCode(''); setGroupModal('join'); setGroupPickerOpen(false); }}>
                    Join with code
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="workspace-switcher" aria-label="Current workspace: My Group">
            <span className="workspace-icon">M</span>
            <span className="workspace-copy"><strong>My Group</strong><small>Personal workspace</small></span>
            <Icon name="down" size={15} className="workspace-chevron" />
          </div>
        )}

        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#overview"><Icon name="grid" /><span>Overview</span></a>
          <a className="nav-link" href="#expenses"><Icon name="receipt" /><span>Expenses</span><span className="nav-count">{expenses.length}</span></a>
          <a className="nav-link" href="#people"><Icon name="users" /><span>People</span></a>
          <a className="nav-link" href="#insights"><Icon name="chart" /><span>Insights</span></a>
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <span className="upgrade-spark">✦</span>
            <strong>Good things add up.</strong>
            <p>Keep every shared moment in one place.</p>
            <a href="#expenses">Explore your activity <Icon name="arrow" size={13} /></a>
          </div>
          <div className="profile-button" aria-label="Local demo profile">
            <span className="avatar avatar-you">Y</span>
            <span className="profile-copy"><strong>{user?.email || 'You'}</strong><small>{supabase ? 'Supabase account' : 'Local demo'}</small></span>
            {supabase && <button className="sign-out-button" type="button" onClick={signOut}>Sign out</button>}
          </div>
        </div>
      </aside>

      <section className="main-area" id="overview">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>Overview</strong></div>
          <div className="topbar-actions">
            <span className={`local-badge ${supabase ? 'connected-badge' : ''}`}><span /> {supabase ? 'Supabase connected' : 'Local preview'}</span>
            {supabase
              ? <button className="top-sign-out" type="button" onClick={signOut}>Sign out</button>
              : <span className="avatar avatar-small" aria-label="Local demo profile">Y</span>}
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> {todayLabel || 'YOUR WORKSPACE'}</p>
              <h1>Good afternoon, <span>{user?.email?.split('@')[0] || 'You'}</span></h1>
              <p className="heading-subtitle">{supabase
                ? activeGroup ? `Here’s what’s happening in ${activeGroup.name}.` : 'Create or join a group to start sharing expenses.'
                : 'Here’s what’s happening with your expenses.'}</p>
            </div>
            <button className="button-primary" type="button" disabled={supabase && !activeGroup} onClick={() => { setFormError(''); setModalOpen(true); }}>
              <Icon name="plus" size={17} /> Add expense
            </button>
          </section>

          {storageError && <div className="storage-alert" role="status">{storageError}</div>}
          {supabase && !groups.length && groupsReady && (
            <section className="group-welcome" aria-labelledby="group-welcome-title">
              <span className="group-welcome-icon"><Icon name="users" size={21} /></span>
              <div className="group-welcome-copy">
                <h2 id="group-welcome-title">Your groups, your private spaces.</h2>
                <p>Create a group for a trip, home, or event, or join one with an invite code from a friend.</p>
              </div>
              <div className="group-welcome-actions">
                <button className="button-primary" type="button" onClick={() => { setGroupError(''); setGroupName(''); setGroupModal('create'); }}>
                  <Icon name="plus" size={15} /> Create group
                </button>
                <button className="button-secondary" type="button" onClick={() => { setGroupError(''); setJoinCode(''); setGroupModal('join'); }}>
                  Join a group
                </button>
              </div>
            </section>
          )}

          <section className="overview-grid" aria-label="Group spending overview">
            <article className="total-card">
              <div className="total-card-top">
                <div>
                  <span className="card-label">{supabase && activeGroup ? 'GROUP SPEND' : 'TOTAL RECORDED SPEND'}</span>
                  <p className="total-amount">{inr(total)}</p>
                </div>
                <span className="total-icon"><Icon name="chart" size={20} /></span>
              </div>
              <div className="total-divider" />
              <div className="total-card-bottom">
                <span><span className="positive-dot" /> Across <strong>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</strong></span>
                <span className="total-caption">All time</span>
              </div>
              <span className="total-decoration decoration-one" />
              <span className="total-decoration decoration-two" />
            </article>

            <article className="metric-card">
              <div className="metric-top"><span className="metric-icon mint"><Icon name="receipt" size={18} /></span><span className="metric-note">THIS ACCOUNT</span></div>
              <div className="metric-value">{expenses.length}</div>
              <div className="metric-footer"><span>Recorded expenses</span><span className="metric-arrow"><Icon name="arrow" size={14} /></span></div>
            </article>

            <article className="metric-card">
              <div className="metric-top"><span className="metric-icon peach"><Icon name="chart" size={18} /></span><span className="metric-note">PER EXPENSE</span></div>
              <div className="metric-value">{inr(average)}</div>
              <div className="metric-footer"><span>Average spend</span><span className="metric-arrow"><Icon name="arrow" size={14} /></span></div>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel expenses-panel" id="expenses">
              <div className="panel-header">
                <div>
                  <div className="panel-title-line"><h2>Recent expenses</h2><span className="subtle-count">{expenses.length}</span></div>
                  <p className="panel-subtitle">A clear view of what your group has spent.</p>
                </div>
                <button className="text-button" type="button" disabled={supabase && !activeGroup} onClick={() => { setFormError(''); setModalOpen(true); }}>
                  <Icon name="plus" size={15} /> Add new
                </button>
              </div>

              <form className="quick-add" onSubmit={(event) => { event.preventDefault(); addQuickExpense(); }}>
                <span className="quick-add-icon"><Icon name="plus" size={17} /></span>
                <input
                  aria-label="Quick add an expense"
                  value={quickText}
                  onChange={(event) => setQuickText(event.target.value)}
                  placeholder={supabase && !activeGroup ? 'Create or join a group to add expenses' : 'Quick add — e.g. Groceries 850'}
                />
                <button type="submit" disabled={!quickText.trim() || saving || (supabase && !activeGroup)}>Add</button>
              </form>

              <div className="expense-toolbar">
                <div className="list-heading">ACTIVITY</div>
                <label className="search-box">
                  <Icon name="search" size={15} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" aria-label="Search expenses" />
                </label>
              </div>

              {visibleExpenses.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon"><Icon name="receipt" size={21} /></span>
                  <strong>{expenses.length ? 'No matching expenses' : 'Your story starts here'}</strong>
                  <p>{expenses.length ? 'Try a different search.' : 'Add your first expense to see it appear here.'}</p>
                  {!expenses.length && !supabase && <button type="button" onClick={() => setModalOpen(true)}>Add an expense <Icon name="arrow" size={14} /></button>}
                </div>
              ) : (
                <div className="expense-list">
                  {visibleExpenses.map((expense) => (
                    <div className="expense-row" key={expense.id}>
                      <div className={`expense-icon ${expense.category ? `category-${expense.category.toLowerCase()}` : ''}`}>{expense.emoji || '🧾'}</div>
                      <div className="expense-info">
                        <strong>{expense.name}</strong>
                        <span>Paid by {expense.paidBy || 'You'} <span className="metadata-dot">·</span> {expense.category || 'Shared expense'}</span>
                      </div>
                      <div className="expense-date">{formatDate(expense.date)}</div>
                      <div className="expense-amount">{inr(expense.amount)}</div>
                      {(!supabase || expense.createdBy === user?.id) && (
                        <button className="remove-button" type="button" aria-label={`Remove ${expense.name}`} disabled={saving} onClick={() => removeExpense(expense.id)}>
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="expense-list-footer"><span>{supabase ? activeGroup ? `Private to ${activeGroup.name}` : 'Choose a group to view expenses' : 'Saved in this browser'}</span><span>{visibleExpenses.length} shown</span></div>
            </article>

            <div className="right-column">
              {supabase && activeGroup && (
                <article className="panel invite-panel">
                  <div className="panel-header compact">
                    <div><h2>Invite to {activeGroup.name}</h2><p className="panel-subtitle">Share this private group code.</p></div>
                    <span className="activity-marker"><Icon name="users" size={15} /></span>
                  </div>
                  <div className="invite-code-row">
                    <code>{activeGroup.join_code}</code>
                    <button className="button-secondary copy-code-button" type="button" onClick={copyJoinCode}>
                      {codeCopied ? 'Copied' : 'Copy code'}
                    </button>
                  </div>
                  <p className="invite-warning">Anyone with this code can join. Share it only with people you trust.</p>
                </article>
              )}
              <article className="panel group-panel" id="people">
                <div className="panel-header compact">
                  <div><h2>Payer activity</h2><p className="panel-subtitle">Who&apos;s been picking up the bill.</p></div>
                  <span className="activity-marker" aria-hidden="true"><Icon name="users" size={15} /></span>
                </div>
                {contributors.length ? (
                  <div className="contributors-list">
                    {contributors.map(([name, amount], index) => (
                      <div className="contributor-row" key={name}>
                        <span className={`avatar contributor-avatar avatar-tone-${index % 4}`}>{name.slice(0, 1).toUpperCase()}</span>
                        <span className="contributor-name">{name}</span>
                        <span className="contributor-amount">{inr(amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mini-empty">Payer activity will appear here once you add expenses.</div>
                )}
                <div className="group-footnote"><span className="info-mark">i</span> Totals reflect recorded expenses only.</div>
              </article>

              <article className="insight-card" id="insights">
                <div className="insight-heading"><span className="insight-icon">✦</span><span>SMART INSIGHT</span></div>
                <h3>{expenses.length ? 'Every expense, in one place.' : 'Start with one shared expense.'}</h3>
                <p>{expenses.length ? 'Your group has recorded ' + inr(total) + ' across ' + expenses.length + (expenses.length === 1 ? ' expense.' : ' expenses.') : 'Add a group expense and keep your shared spending organized.'}</p>
                <div className="insight-rule" />
                <span className="insight-caption"><span className="pulse-dot" /> Updated as you add expenses</span>
              </article>
            </div>
          </section>

          <footer className="page-footer">
            <span>SplitSmart <span className="footer-dot">·</span> A simpler way to share.</span>
            <span>{supabase ? 'Group expenses are private to their members.' : 'Preview data is stored locally in your browser.'}</span>
          </footer>
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape') setModalOpen(false); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <div><span className="modal-kicker">{activeGroup?.name || 'MY GROUP'}</span><h2 id="modal-title">Add an expense</h2></div>
              <button className="icon-button modal-close" type="button" aria-label="Close dialog" onClick={() => setModalOpen(false)}><Icon name="close" /></button>
            </div>
            <p className="modal-description">Keep track of a shared purchase. You can add split details later.</p>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <form className="expense-form" onSubmit={addExpense}>
              <label className="field-label">What was it for?
                <input name="name" autoFocus maxLength={80} placeholder="e.g. Dinner, groceries" required />
              </label>
              <div className="form-row">
                <label className="field-label">Amount
                  <span className="amount-input"><span>₹</span><input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></span>
                </label>
                <label className="field-label">Category
                  <select name="category" defaultValue="Food">
                    <option>Food</option><option>Travel</option><option>Home</option><option>Shopping</option><option>Other</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field-label">Paid by
                  <input name="paidBy" maxLength={50} defaultValue={user?.email || 'You'} required />
                </label>
                <label className="field-label">Date
                  <span className="date-input"><Icon name="calendar" size={16} />                  <input name="date" type="date" defaultValue={localDateString()} /></span>
                </label>
              </div>
              <div className="modal-actions">
                <button className="button-secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
                <button className="button-primary" type="submit" disabled={saving}><Icon name="plus" size={16} /> {saving ? 'Saving…' : 'Save expense'}</button>
              </div>
              <p className="form-disclaimer">{supabase ? 'Saved to your Supabase account. No actual payments are recorded.' : 'This preview saves in this browser only. No actual payments are recorded.'}</p>
            </form>
          </section>
        </div>
      )}
      {groupModal && (
        <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape' && !groupBusy) setGroupModal(''); }} onMouseDown={(event) => { if (event.target === event.currentTarget && !groupBusy) setGroupModal(''); }}>
          <section className="expense-modal group-modal" role="dialog" aria-modal="true" aria-labelledby="group-modal-title">
            <div className="modal-header">
              <div>
                <span className="modal-kicker">PRIVATE GROUP</span>
                <h2 id="group-modal-title">{groupModal === 'create' ? 'Create a group' : 'Join a group'}</h2>
              </div>
              <button className="icon-button modal-close" type="button" aria-label="Close dialog" disabled={groupBusy} onClick={() => setGroupModal('')}>
                <Icon name="close" />
              </button>
            </div>
            <p className="modal-description">{groupModal === 'create'
              ? 'Start a private space for a trip, home, or shared event.'
              : 'Enter the invitation code shared by a group member.'}</p>
            {groupError && <p className="form-error" role="alert">{groupError}</p>}
            {groupModal === 'create' ? (
              <form className="expense-form" onSubmit={createGroup}>
                <label className="field-label">Group name
                  <input
                    name="groupName"
                    autoFocus
                    maxLength={80}
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="e.g. Goa Trip"
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button className="button-secondary" type="button" disabled={groupBusy} onClick={() => setGroupModal('')}>Cancel</button>
                  <button className="button-primary" type="submit" disabled={groupBusy || !groupName.trim()}>
                    <Icon name="plus" size={15} /> {groupBusy ? 'Creating…' : 'Create group'}
                  </button>
                </div>
              </form>
            ) : (
              <form className="expense-form" onSubmit={joinGroup}>
                <label className="field-label">Invitation code
                  <input
                    name="joinCode"
                    autoFocus
                    maxLength={32}
                    autoCapitalize="characters"
                    autoComplete="off"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.replace(/\s/g, '').toUpperCase())}
                    placeholder="Paste the group code"
                    required
                  />
                </label>
                <p className="form-disclaimer">Only join groups from people you trust. The code grants access to that group.</p>
                <div className="modal-actions">
                  <button className="button-secondary" type="button" disabled={groupBusy} onClick={() => setGroupModal('')}>Cancel</button>
                  <button className="button-primary" type="submit" disabled={groupBusy || !joinCode.trim()}>
                    {groupBusy ? 'Joining…' : 'Join group'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
