import { FastResponse } from 'srvx';
import handler from '@tanstack/react-start/server-entry';

globalThis.Response = FastResponse;

export default handler;