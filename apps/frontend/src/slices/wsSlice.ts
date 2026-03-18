import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface WsState {
  connected: boolean;
}

const initialState: WsState = {
  connected: false,
};

const wsSlice = createSlice({
  name: 'ws',
  initialState,
  reducers: {
    setWsConnected(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
  },
});

export const { setWsConnected } = wsSlice.actions;

export default wsSlice.reducer;
