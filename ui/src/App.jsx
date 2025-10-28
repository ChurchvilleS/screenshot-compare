import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const env = typeof window !== 'undefined'
  ? (window.__APP_ENV__ || import.meta.env)
  : import.meta.env;

const apiHost = env?.VITE_API_HOST || env?.API_HOST || 'localhost';
const apiPort = Number.parseInt(env?.VITE_API_PORT || env?.API_PORT, 10) || 5001;
const apiBaseUrl = env?.VITE_API_TARGET || env?.API_TARGET || `http://${apiHost}:${apiPort}`;

axios.defaults = axios.defaults || {};
axios.defaults.baseURL = apiBaseUrl;

const STATUS_BADGE_VARIANT = {
  pending: 'warning',
  success: 'success',
  error: 'danger'
};

const DUPLICATE_WINDOW_MS = 10_000;
const POLL_INTERVAL_MS = 5000;
const DEFAULT_NORMALIZE_STRATEGY = 'crop';

export default function App() {
  const [formState, setFormState] = useState({ urlA: '', urlB: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [errors, setErrors] = useState({});
  const [history, setHistory] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(5);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [recentSubmissions, setRecentSubmissions] = useState([]);

  const validateUrl = (value) => {
    if (!value || !value.trim()) {
      return 'URL is required.';
    }
    try {
      // eslint-disable-next-line no-new
      new URL(value.trim());
      return null;
    } catch (error) {
      return 'Enter a valid URL including protocol (e.g., https://example.com).';
    }
  };

  const buildPayload = useCallback(() => ({
    reference: {
      baseUrl: formState.urlA.trim()
    },
    target: {
      baseUrl: formState.urlB.trim()
    },
    comparison: {
      normalizeStrategy: DEFAULT_NORMALIZE_STRATEGY
    }
  }), [formState.urlA, formState.urlB]);

  const fetchHistory = useCallback(async (page = 1, limit = itemsPerPage) => {
    setIsLoadingHistory(true);
    try {
      const response = await axios.get('/api/comparisons', {
        params: { page, limit }
      });
      const { items = [], pagination = {} } = response.data || {};
      setHistory(items);
      setCurrentPage(pagination.currentPage || page);
      setTotalPages(pagination.totalPages || 1);
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error.message || 'Unable to load history.';
      setAlerts((current) => [
        ...current,
        {
          id: `alert-${Date.now()}`,
          type: 'danger',
          text: errorMessage,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [itemsPerPage]);

  useEffect(() => {
    fetchHistory(1, itemsPerPage);
  }, [fetchHistory, itemsPerPage]);

  useEffect(() => {
    const hasPending = history.some((item) => item.status === 'pending');
    if (!hasPending) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setIsRefreshing(true);
      fetchHistory(currentPage, itemsPerPage).finally(() => {
        setIsRefreshing(false);
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [history, currentPage, itemsPerPage, fetchHistory]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) {
        return current;
      }
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    const validationResults = {
      urlA: validateUrl(formState.urlA),
      urlB: validateUrl(formState.urlB)
    };

    const hasErrors = Object.values(validationResults).some(Boolean);
    if (hasErrors) {
      setErrors(
        Object.fromEntries(
          Object.entries(validationResults).filter(([, value]) => Boolean(value))
        )
      );
      setMessage({ type: 'danger', text: 'Fix validation errors before submitting.' });
      return;
    }
    setErrors({});

    const payload = buildPayload();
    const submissionKey = `${payload.reference.baseUrl}::${payload.target.baseUrl}`;
    const duplicateWindow = Date.now() - DUPLICATE_WINDOW_MS;
    const hasRecentDuplicate = recentSubmissions.some(({ key, timestamp }) => (
      key === submissionKey && timestamp >= duplicateWindow
    ));

    if (hasRecentDuplicate) {
      setMessage({ type: 'warning', text: 'Duplicate request detected. Please wait before submitting the same URLs again.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage({ type: 'info', text: 'Submitting comparison request…' });

      const optimisticId = `pending-${Date.now()}`;
      const optimisticEntry = {
        id: optimisticId,
        title: `${payload.reference.baseUrl} → ${payload.target.baseUrl}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
        diffPercent: null,
        href: null
      };
      setHistory((current) => [optimisticEntry, ...current]);

      const response = await axios.post('/api/comparisons', payload);
      const { reportPath, changeSummary, comparisonId } = response.data || {};

      setHistory((current) => current.map((item) => {
        if (item.id !== optimisticId) {
          return item;
        }
        return {
          ...item,
          id: comparisonId || optimisticId,
          status: 'success',
          diffPercent: changeSummary || null,
          href: reportPath || null
        };
      }));

      setMessage({ type: 'success', text: 'Comparison requested successfully.' });
      setFormState({ urlA: '', urlB: '' });
      setRecentSubmissions((current) => [
        { key: submissionKey, timestamp: Date.now() },
        ...current
      ].slice(0, 10));
      fetchHistory(1, itemsPerPage);
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error.message || 'Request failed.';
      setMessage({
        type: 'danger',
        text: errorMessage
      });
      setAlerts((current) => [
        ...current,
        {
          id: `alert-${Date.now()}`,
          type: 'danger',
          text: errorMessage,
          timestamp: new Date().toISOString()
        }
      ]);
      setHistory((current) => current.map((item) => (
        item.status === 'pending'
          ? { ...item, status: 'error', errorMessage }
          : item
      )));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePageChange = useCallback((page) => {
    if (page < 1 || page > totalPages || page === currentPage || isLoadingHistory) {
      return;
    }
    fetchHistory(page, itemsPerPage);
  }, [totalPages, currentPage, isLoadingHistory, fetchHistory, itemsPerPage]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchHistory(currentPage, itemsPerPage).finally(() => {
      setIsRefreshing(false);
    });
  };

  const dismissAlert = (id) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  };

  const paginationControls = useMemo(() => {
    if (totalPages <= 1) {
      return null;
    }

    const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

    return (
      <nav aria-label="History pagination">
        <ul className="pagination pagination-sm mb-0">
          <li className={`page-item ${currentPage === 1 || isLoadingHistory ? 'disabled' : ''}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoadingHistory}
            >
              Previous
            </button>
          </li>
          {pages.map((page) => (
            <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
              <button
                type="button"
                className="page-link"
                onClick={() => handlePageChange(page)}
                aria-current={page === currentPage ? 'page' : undefined}
                disabled={isLoadingHistory}
              >
                {page}
              </button>
            </li>
          ))}
          <li className={`page-item ${currentPage === totalPages || isLoadingHistory ? 'disabled' : ''}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isLoadingHistory}
            >
              Next
            </button>
          </li>
        </ul>
      </nav>
    );
  }, [currentPage, totalPages, isLoadingHistory, handlePageChange]);

  return (
    <div className="bg-light min-vh-100 d-flex flex-column">
      <a href="#main" className="visually-hidden-focusable skip-link">Skip to main content</a>
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm" role="navigation" aria-label="Main navigation">
        <div className="container">
          <span className="navbar-brand fw-semibold">Screenshot Comparison Tool</span>
        </div>
      </nav>

      <main id="main" className="container py-4" role="main">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-10 col-xl-8">
            <section className="card shadow-sm mb-4" aria-labelledby="comparisonFormHeading">
              <div className="card-header bg-white">
                <h2 id="comparisonFormHeading" className="h5 mb-0">URL Comparison</h2>
              </div>
              <div className="card-body">
                <p className="text-muted mb-4" id="formDescription">
                  Enter two URLs to capture and compare. The tool will queue a job using the dynamic report naming workflow.
                </p>
                {message && (
                  <div className={`alert alert-${message.type}`} role="alert" aria-live="assertive">
                    {message.text}
                  </div>
                )}
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`alert alert-${alert.type} alert-dismissible fade show`}
                    role="alert"
                    aria-live="assertive"
                  >
                    <strong>{alert.type === 'danger' ? 'Error:' : 'Notice:'}</strong> {alert.text}
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={() => dismissAlert(alert.id)}
                    />
                  </div>
                ))}
                <form onSubmit={handleSubmit} className="row g-3" aria-describedby="formDescription">
                  <div className="col-12 col-md-6">
                    <div className="form-floating">
                      <input
                        id="urlA"
                        name="urlA"
                        type="url"
                        required
                        className={`form-control ${errors.urlA ? 'is-invalid' : ''}`}
                        placeholder="https://example.com"
                        value={formState.urlA}
                        onChange={handleChange}
                        aria-describedby="urlAHelp"
                        aria-invalid={Boolean(errors.urlA)}
                      />
                      <label htmlFor="urlA">Reference URL</label>
                      {errors.urlA && (
                        <div id="urlAHelp" className="invalid-feedback">
                          {errors.urlA}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="form-floating">
                      <input
                        id="urlB"
                        name="urlB"
                        type="url"
                        required
                        className={`form-control ${errors.urlB ? 'is-invalid' : ''}`}
                        placeholder="https://target.example.com"
                        value={formState.urlB}
                        onChange={handleChange}
                        aria-describedby="urlBHelp"
                        aria-invalid={Boolean(errors.urlB)}
                      />
                      <label htmlFor="urlB">Target URL</label>
                      {errors.urlB && (
                        <div id="urlBHelp" className="invalid-feedback">
                          {errors.urlB}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-12 d-flex justify-content-end">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="card shadow-sm" aria-labelledby="historyHeading">
              <div className="card-header bg-white d-flex align-items-center justify-content-between">
                <h2 id="historyHeading" className="h5 mb-0">Recent Runs</h2>
                <span className="badge bg-secondary">Pagination enabled</span>
              </div>
              <div
                className="list-group list-group-flush"
                role="list"
                aria-live="polite"
                aria-busy={isLoadingHistory}
              >
                {isLoadingHistory && (
                  <div className="list-group-item" role="status">
                    <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                    Loading history…
                  </div>
                )}
                {!isLoadingHistory && history.length === 0 && (
                  <div className="list-group-item" role="listitem">
                    <div className="alert alert-info mb-0" role="alert">
                      No comparison runs yet. Submit URLs above to generate your first report and start building the history timeline.
                    </div>
                  </div>
                )}
                {!isLoadingHistory && history.map((item) => {
                  const badgeVariant = STATUS_BADGE_VARIANT[item.status] || 'secondary';
                  const timestamp = item.createdAt ? new Date(item.createdAt) : null;
                  const timestampLabel = timestamp
                    ? timestamp.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Timestamp unavailable';

                  const summaryText = item.diffPercent
                    ? `${item.diffPercent} change`
                    : item.status === 'pending'
                      ? 'Queued for processing'
                      : item.status === 'error'
                        ? 'Comparison failed'
                        : 'Awaiting summary';

                  return (
                    <div key={item.id} className="list-group-item" role="listitem">
                      <div className="d-flex flex-column flex-lg-row align-items-lg-center w-100">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <span className="fw-semibold text-truncate" title={item.title}>
                              {item.title}
                            </span>
                            <span className={`badge bg-${badgeVariant}`} aria-label={`Status: ${item.status}`}>
                              {item.status === 'pending' && 'In Progress'}
                              {item.status === 'success' && 'Complete'}
                              {item.status === 'error' && 'Failed'}
                            </span>
                          </div>
                          <div className="text-muted small d-flex flex-column flex-md-row gap-2">
                            <span>{timestampLabel}</span>
                            <span aria-live="polite">{summaryText}</span>
                            {item.normalizationSummary && (
                              <span className="text-warning" aria-live="polite">{item.normalizationSummary}</span>
                            )}
                          </div>
                        </div>
                        {item.href && item.status === 'success' ? (
                          <a
                            href={item.href}
                            className="btn btn-outline-primary btn-sm mt-3 mt-lg-0 ms-lg-3 flex-shrink-0"
                            aria-label={`View report for ${item.title}`}
                          >
                            View Report
                          </a>
                        ) : (
                          <div className="mt-3 mt-lg-0 ms-lg-3 text-muted small" aria-live="polite">
                            {item.status === 'pending' && 'Preparing report…'}
                            {item.status === 'error' && item.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="card-footer bg-white d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                {paginationControls}
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={handleManualRefresh}
                    disabled={isLoadingHistory}
                    aria-label="Refresh history"
                  >
                    {isRefreshing ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                        Refreshing…
                      </>
                    ) : (
                      'Refresh'
                    )}
                  </button>
                  <small className="text-muted mb-0">
                    Page {currentPage} of {totalPages}
                  </small>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-auto py-3 bg-white border-top" role="contentinfo">
        <div className="container">
          <small className="text-muted">© {new Date().getFullYear()} Screenshot Comparison Tool</small>
        </div>
      </footer>
    </div>
  );
}
