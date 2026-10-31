import { PortInfo } from '../../features/ports/port-types';

/** Port, address, pid and process name of each row, for comparing whole lists in one assertion. */
export const brief = (ports: PortInfo[]) => ports.map(p => [p.port, p.address, p.pid, p.processName]);

/** Port, address and pid of each row. */
export const portsAndPids = (ports: PortInfo[]) => ports.map(p => [p.port, p.address, p.pid]);
