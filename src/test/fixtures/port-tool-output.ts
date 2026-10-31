/** Real-world shaped output of each listing tool, including rows with hidden processes. */

export const SS_OUTPUT = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*         users:(("systemd-resolve",pid=612,fd=14))
LISTEN 0      128          0.0.0.0:22    0.0.0.0:*         users:(("sshd",pid=801,fd=3))
LISTEN 0      511                *:3000        *:*         users:(("node",pid=4242,fd=19))
LISTEN 0      4096         0.0.0.0:5432  0.0.0.0:*
LISTEN 0      128             [::]:22       [::]:*         users:(("sshd",pid=801,fd=4))
LISTEN 0      511          0.0.0.0:80    0.0.0.0:*         users:(("nginx",pid=900,fd=6),("nginx",pid=901,fd=6))
`;

export const LSOF_OUTPUT = `p612
csystemd-resolve
Lsystemd-resolve
n127.0.0.53:53
p4242
cnode
Lvarun
n*:3000
n[::1]:3000
`;

export const NETSTAT_OUTPUT = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      612/systemd-resolve
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      -
tcp        0      0 127.0.0.1:9222          0.0.0.0:*               LISTEN      2001/Web Content
tcp6       0      0 :::22                   :::*                    LISTEN      -
`;

/**
 * `lsof -iTCP -sTCP:LISTEN -nP` as printed on macOS. Hand-built in macOS's format (hex DEVICE,
 * "\\x20" escapes), not captured from a Mac: replace with a real capture when one is available.
 */
export const MACOS_LSOF_TABLE_OUTPUT = `COMMAND     PID        USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
launchd       1        root    5u  IPv6 0x6b2f4c1a9d3e1a17      0t0  TCP *:22 (LISTEN)
rapportd    412       varun    8u  IPv4 0x6b2f4c1a9d3e8a57      0t0  TCP *:49152 (LISTEN)
rapportd    412       varun    9u  IPv6 0x6b2f4c1a9d3e9b87      0t0  TCP *:49152 (LISTEN)
ControlCe   498       varun   10u  IPv4 0x6b2f4c1a9d3eab27      0t0  TCP *:7000 (LISTEN)
Google\\x20Chrome  1203       varun   42u  IPv4 0x6b2f4c1a9d3ebc97      0t0  TCP 127.0.0.1:9222 (LISTEN)
node       5521       varun   23u  IPv6 0x6b2f4c1a9d3ecd07      0t0  TCP [::1]:3000 (LISTEN)
postgres   7788   _postgres    7u  IPv4 0x6b2f4c1a9d3eded7      0t0  TCP 127.0.0.1:5432 (LISTEN)
`;

export const MACOS_PS_OUTPUT = `    1 root             /sbin/launchd
  412 varun            /usr/libexec/rapportd
 5521 varun            node server.js --port 3000
`;

export const PS_OUTPUT = `  612 systemd-resolve        /usr/lib/systemd/systemd-resolved
  801 root                   sshd: /usr/sbin/sshd -D
 4242 varun                  node server.js --port 3000
`;
