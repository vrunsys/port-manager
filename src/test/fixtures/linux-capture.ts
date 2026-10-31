// In fixtures/linux/*.txt, pid 31368 is a helper process that held ports 18101-18106 (IPv4, IPv6,
// wildcard and dual-stack binds) and pid 31375 shared port 18106 with it (SO_REUSEPORT).
// Ports 53 and 631 belong to other users, so their process is hidden.
export const HELPER = 31368;
export const HELPER_PEER = 31375;
