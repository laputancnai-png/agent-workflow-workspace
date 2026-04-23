import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useSubmitDecision } from '../../src/hooks/useDecision.js';
import { createWrapper } from '../helpers/wrapper.js';
import { server } from '../mocks/server.js';

describe('useSubmitDecision', () => {
  it('calls POST /steps/:id/decision and returns success', async () => {
    server.use(
      http.post('/api/v1/steps/s_1/decision', () =>
        HttpResponse.json({ data: { id: 'd_1', action: 'approve' } })
      )
    );

    const { result } = renderHook(() => useSubmitDecision(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ stepId: 's_1', action: 'approve' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
