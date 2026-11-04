import { createContext, useContext } from 'react';
import type { DateRange } from '../../shared/contracts';
export const PeriodContext = createContext<DateRange>({});
export const usePeriod = () => useContext(PeriodContext);
export { PeriodPicker } from './period-picker';
