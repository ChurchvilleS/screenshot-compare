import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import App from '../App';

jest.mock('axios');

const DEFAULT_PAGINATION = { currentPage: 1, totalPages: 1 };

const mockHistoryEntry = (overrides = {}) => ({
  id: 'comparison-1',
  title: 'https://example.com → https://target.example.com',
  status: 'success',
  createdAt: new Date('2025-10-27T15:00:00Z').toISOString(),
  diffPercent: '2% change',
  href: '/reports/123.html',
  errorMessage: null,
  normalizationSummary: null,
  ...overrides
});

const mockHistoryResponse = (overrides = {}) => ({
  items: [],
  pagination: DEFAULT_PAGINATION,
  ...overrides
});

const renderWithHistory = async (responses = [mockHistoryResponse()]) => {
  responses.forEach((response) => {
    axios.get.mockResolvedValueOnce({ data: response });
  });

  const user = userEvent.setup();
  render(<App />);

  const first = responses[0];
  if (first.items.length > 0) {
    await screen.findByText(first.items[0].title);
  } else {
    await screen.findByText(/No comparison runs yet/i);
  }

  return user;
};

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({
      data: {
        reportPath: '/reports/123.html',
        changeSummary: '2% change',
        comparisonId: 'comparison-123'
      }
    });
  });

  test('shows validation feedback when URLs are missing', async () => {
    await renderWithHistory();

    const submitButton = screen.getByRole('button', { name: /submit/i });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form);

    expect(await screen.findByText(/Fix validation errors before submitting/i)).toBeInTheDocument();
    const messages = await screen.findAllByText(/URL is required\./i);
    expect(messages).toHaveLength(2);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('requests next and previous pages through pagination controls', async () => {
    const firstPage = mockHistoryResponse({
      items: [mockHistoryEntry({ id: 'comparison-1' })],
      pagination: { currentPage: 1, totalPages: 2 }
    });
    const secondPage = mockHistoryResponse({
      items: [mockHistoryEntry({ id: 'comparison-2' })],
      pagination: { currentPage: 2, totalPages: 2 }
    });
    const backToFirst = mockHistoryResponse({
      items: [mockHistoryEntry({ id: 'comparison-1' })],
      pagination: { currentPage: 1, totalPages: 2 }
    });

    const user = await renderWithHistory([firstPage, secondPage, backToFirst]);

    await screen.findByText(/Page 1 of 2/i);

    const nextButton = screen.getByRole('button', { name: /next/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(axios.get).toHaveBeenLastCalledWith('/api/comparisons', {
        params: { page: 2, limit: 5 }
      });
    });

    await screen.findByText(/Page 2 of 2/i);

    const previousButton = screen.getByRole('button', { name: /previous/i });
    await user.click(previousButton);

    await waitFor(() => {
      expect(axios.get).toHaveBeenLastCalledWith('/api/comparisons', {
        params: { page: 1, limit: 5 }
      });
    });
  });

  test('prevents duplicate submissions within the duplicate window', async () => {
    const initialHistory = mockHistoryResponse();
    const refreshedHistory = mockHistoryResponse({
      items: [mockHistoryEntry({ id: 'comparison-123', status: 'success' })]
    });

    const user = await renderWithHistory([initialHistory, refreshedHistory]);

    const nowValues = { value: 1_000 };
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowValues.value);

    const urlA = screen.getByLabelText(/Reference URL/i);
    const urlB = screen.getByLabelText(/Target URL/i);

    await user.type(urlA, 'https://baseline.example.com');
    await user.type(urlB, 'https://candidate.example.com');

    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
    await screen.findByText(/Comparison requested successfully/i);

    nowValues.value = 1_500;
    await user.type(urlA, 'https://baseline.example.com');
    await user.type(urlB, 'https://candidate.example.com');

    nowValues.value = 1_800;
    await user.click(submitButton);

    expect(await screen.findByText(/Duplicate request detected/i)).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(1);

    nowSpy.mockRestore();
  });

  test('displays normalization summary when present in history', async () => {
    const historyWithNormalization = mockHistoryResponse({
      items: [mockHistoryEntry({
        id: 'comparison-normalized',
        normalizationSummary: 'Normalized 2 captures'
      })]
    });

    await renderWithHistory([historyWithNormalization]);

    const summary = await screen.findByText('Normalized 2 captures');
    expect(summary).toHaveClass('text-warning');
  });

  test('shows alert when history fetch fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network unavailable'));

    render(<App />);

    await waitFor(() => expect(axios.get).toHaveBeenCalled());

    const alert = await screen.findByText(/Network unavailable/i);
    expect(alert).toBeInTheDocument();
  });

  test('shows error alert and updates history when submission fails', async () => {
  const user = await renderWithHistory();

  axios.post.mockRejectedValueOnce({
    response: { data: { message: 'Comparison failed to start.' } }
  });

  const urlA = screen.getByLabelText(/Reference URL/i);
  const urlB = screen.getByLabelText(/Target URL/i);

  await user.type(urlA, 'https://baseline.example.com');
  await user.type(urlB, 'https://candidate.example.com');

  const submitButton = screen.getByRole('button', { name: /submit/i });
  await user.click(submitButton);

  const alerts = await screen.findAllByRole('alert');
  expect(alerts.some((element) => element.textContent.includes('Comparison failed to start.'))).toBe(true);

  const historyList = screen.getByRole('list');
  expect(within(historyList).getByText(/Comparison failed to start\./i)).toBeInTheDocument();
  });
});
