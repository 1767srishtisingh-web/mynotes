/* ==========================================================================
   MyNotes — script.js
   A client-only marketplace for unit-wise university notes.

   Modules (in order):
     1. Config and utilities
     2. Seed data
     3. Store (localStorage persistence)
     4. Selectors (derived data)
     5. Document content (simulated PDF pages)
     6. Pdf (tiny PDF writer for downloads and invoices)
     7. Toast and Modal
     8. Catalog (student marketplace)
     9. Preview and Checkout (payment simulator)
    10. Reader (active reading-time tracker)
    11. Summary, Rating, Profile
    12. Faculty: Publish, Engagement, Earnings
    13. App (role switch, wiring, init)
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- 1. Config and utilities ---------- */
  const STORE_KEY = 'mynotes.state.v1';
  const COMMISSION_RATE = 0.15;       // platform share of each sale
  const IDLE_LIMIT_MS = 60_000;       // reading timer pauses after this much inactivity
  const FREE_PAGES = 2;               // pages shown in the sample viewer
  const ME_STUDENT = 's-me';
  const ME_FACULTY = 'f1';
  const DAY = 86_400_000;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + fn(x), 0);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const inr = (n) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
  const fmtDate = (t) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(t);
  const fmtTime = (t) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(t);
  const fmtHour = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;
  const fmtDur = (sec) => {
    sec = Math.round(sec);
    if (sec < 60) return `${sec} s`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  const fmtClock = (sec) => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const two = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
  };
  const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));
  const initials = (name) => name.replace(/^(Dr|Prof)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const shortName = (full) => {
    const parts = full.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  };
  const mulberry32 = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hashStr = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFineHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 2. Seed data ---------- */
  const SEED_FACULTY = {
    f1: { id: 'f1', name: 'Dr. Meera Iyer', college: 'Sarvodaya Institute of Technology, Lucknow', uni: 'AKTU', bank: 'HDFC Bank account ending 4821' },
    f2: { id: 'f2', name: 'Prof. Arvind Kulkarni', college: 'Deccan College of Engineering, Pune', uni: 'SPPU' },
    f3: { id: 'f3', name: 'Dr. Kavitha Rao', college: 'Malnad School of Engineering, Mysuru', uni: 'VTU' },
    f4: { id: 'f4', name: 'Prof. Sandeep Bhatia', college: 'Sabarmati Engineering College, Ahmedabad', uni: 'GTU' },
    f5: { id: 'f5', name: 'Dr. Farah Siddiqui', college: 'Gomti Institute of Engineering, Lucknow', uni: 'AKTU' },
    f6: { id: 'f6', name: 'Dr. Joseph Mathew', college: 'Periyar Valley College of Engineering, Kochi', uni: 'KTU' },
  };

  const SEED_STUDENTS = ['Rahul Saxena', 'Priya Nair', 'Aditya Verma', 'Sneha Kulkarni', 'Imran Khan', 'Ananya Gupta', 'Karthik Reddy', 'Pooja Mishra', 'Harpreet Singh', 'Divya Menon']
    .map((name, i) => ({ id: `s${i + 1}`, name }));

  const T = (name, gist) => ({ name, gist });
  const note = (id, facultyId, subject, code, sem, branch, unit, title, description, pages, price, rating, ratingCount, reads, topics) =>
    ({ id, facultyId, subject, code, sem, branch, unit, title, description, pages, price, rating, ratingCount, reads, topics, createdAt: 0 });

  const SEED_NOTES = [
    note('n1', 'f1', 'Data Structures', 'KCS301', 3, 'CSE', 1, 'Arrays, linked lists and complexity analysis',
      'Covers asymptotic notation, array address calculation and every linked list variant asked in the end-semester paper, with traced examples.',
      22, 100, 4.6, 148, 1840, [
        T('Asymptotic notation', 'Big-O, Omega and Theta describe how running time grows with input size n, ignoring constants and lower-order terms. Big-O is an upper bound, Omega a lower bound and Theta a tight bound.'),
        T('Arrays and address calculation', 'An array stores elements in contiguous memory, so element i is reached in constant time. For a row-major 2D array, address(A[i][j]) = base + ((i - lb1) * columns + (j - lb2)) * element size.'),
        T('Singly linked lists', 'Each node holds data and a pointer to the next node. Insertion and deletion at a known position take constant time, but reaching position k takes k steps because there is no random access.'),
        T('Doubly and circular lists', 'A doubly linked list adds a previous pointer, so traversal works both ways and deletion needs no trailing pointer. In a circular list the last node points back to the first, which suits round-robin processing.'),
        T('Sparse matrices and polynomials', 'A sparse matrix stores only its non-zero entries as (row, column, value) triples. Polynomials are stored as linked lists of (coefficient, exponent) terms kept in decreasing order of exponent.'),
      ]),
    note('n2', 'f1', 'Data Structures', 'KCS301', 3, 'CSE', 3, 'Trees, BST and AVL rotations',
      'Tree terminology, traversals, BST operations, all four AVL rotation cases, heaps and B-trees, each with a worked insertion sequence.',
      26, 120, 4.8, 203, 2610, [
        T('Binary tree traversals', 'Inorder visits left, root, right; preorder visits the root first; postorder visits the root last. A binary tree can be rebuilt uniquely from its inorder sequence plus either its preorder or postorder sequence.'),
        T('Binary search trees', 'In a BST every key in the left subtree is smaller than the node and every key in the right subtree is larger. Search, insert and delete take time proportional to the height: log n when balanced and n in the worst case.'),
        T('AVL trees and rotations', 'An AVL tree keeps the balance factor (left height minus right height) of every node at -1, 0 or +1. Imbalance after an insertion is fixed by one of four cases: LL and RR need a single rotation, LR and RL need a double rotation.'),
        T('Heaps and priority queues', 'A binary max-heap is a complete binary tree in which each parent is at least as large as its children, stored compactly in an array. Insert and delete-max take O(log n); building a heap from n items takes O(n).'),
        T('B-trees', 'A B-tree of order m keeps up to m - 1 sorted keys per node and all leaves at the same level, which keeps disk reads low. A node splits when it overflows and its middle key moves up to the parent.'),
      ]),
    note('n3', 'f1', 'Database Management Systems', 'KCS501', 5, 'CSE', 2, 'Relational model, SQL and relational algebra',
      'Keys, integrity constraints, relational algebra operators and SQL from basic SELECT to joins, grouping and nested queries.',
      24, 100, 4.5, 96, 1325, [
        T('Relational model and keys', 'A relation is a set of tuples over named attributes. A super key identifies tuples uniquely, a candidate key is a minimal super key, and the primary key is the candidate key the designer chooses.'),
        T('Integrity constraints', 'Entity integrity forbids nulls in a primary key. Referential integrity requires every foreign key value to match a primary key value in the referenced relation, or to be null.'),
        T('Relational algebra', 'Selection picks rows, projection picks columns and join combines relations on a condition. Together with union, set difference, Cartesian product and rename they form a complete set of operations.'),
        T('SQL queries and joins', 'A SELECT statement is evaluated logically in the order FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY. An inner join keeps matching rows only; left, right and full outer joins also keep unmatched rows padded with nulls.'),
        T('Aggregates, views and subqueries', 'COUNT, SUM, AVG, MIN and MAX collapse a group into one value, and HAVING filters groups after aggregation. A view is a stored query that behaves like a virtual table.'),
      ]),
    note('n4', 'f1', 'Database Management Systems', 'KCS501', 5, 'CSE', 4, 'Transactions, concurrency control and recovery',
      'ACID, serialisability tests with precedence graphs, locking protocols, deadlock handling and log-based recovery with solved schedules.',
      28, 150, 4.7, 121, 1580, [
        T('ACID properties', 'Atomicity means all or nothing, consistency preserves the database rules, isolation hides concurrent transactions from each other, and durability keeps committed changes after a crash.'),
        T('Schedules and serialisability', 'A schedule is conflict serialisable if its precedence graph has no cycle. View serialisability is a weaker condition and is harder to test.'),
        T('Two-phase locking', 'In two-phase locking a transaction acquires locks in a growing phase and releases them in a shrinking phase, which guarantees conflict serialisability. Strict 2PL holds exclusive locks until commit and so avoids cascading rollbacks.'),
        T('Deadlock handling', 'Wait-die and wound-wait use timestamps to prevent deadlock. Detection instead builds a wait-for graph and aborts a victim transaction when it finds a cycle.'),
        T('Log-based recovery', 'With write-ahead logging the log record reaches stable storage before the data page does. After a crash, committed transactions are redone and uncommitted ones are undone, starting from the last checkpoint.'),
      ]),
    note('n5', 'f2', 'Operating Systems', '210253', 4, 'CSE', 2, 'Process scheduling and synchronisation',
      'Process states, Gantt-chart problems for every scheduling algorithm, the critical section problem, semaphores and the classical problems.',
      25, 100, 4.7, 312, 3920, [
        T('Process states and the PCB', 'A process moves between the new, ready, running, waiting and terminated states. The process control block stores its program counter, registers, scheduling information and open files so that a context switch can resume it.'),
        T('CPU scheduling algorithms', 'FCFS is simple but suffers from the convoy effect. SJF gives the minimum average waiting time but needs burst estimates. Round robin gives each process a time quantum and suits time sharing.'),
        T('Critical section problem', 'A correct solution provides mutual exclusion, progress and bounded waiting. Peterson\'s solution achieves all three for two processes using a flag array and a turn variable.'),
        T('Semaphores', 'A semaphore is an integer changed only by the atomic operations wait and signal. A binary semaphore gives mutual exclusion; a counting semaphore controls access to a pool of identical resources.'),
        T('Classical synchronisation problems', 'Producer-consumer, readers-writers and dining philosophers are the standard tests for a synchronisation scheme. Each is solved with a small set of semaphores acquired in a careful order.'),
      ]),
    note('n6', 'f2', 'Operating Systems', '210253', 4, 'CSE', 4, 'Memory management and virtual memory',
      'Allocation strategies, paging and segmentation with address translation numericals, demand paging and page replacement traces.',
      20, 90, 4.4, 187, 2240, [
        T('Contiguous allocation and fragmentation', 'First fit, best fit and worst fit place a process in a free hole. External fragmentation leaves free memory in pieces too small to use; compaction fixes it at the cost of moving processes.'),
        T('Paging', 'Paging divides logical memory into pages and physical memory into frames of the same size. The page table maps page numbers to frame numbers, and a TLB caches recent translations to avoid a second memory access.'),
        T('Segmentation', 'Segmentation divides a program into logical units such as code, stack and heap, each with a base and a limit. It matches the programmer\'s view but brings back external fragmentation.'),
        T('Demand paging and page faults', 'With demand paging a page is loaded only when it is first referenced. A reference to a page that is not in memory raises a page fault, and the operating system brings the page in from disk.'),
        T('Page replacement and thrashing', 'FIFO can show Belady\'s anomaly, optimal replacement gives the fewest faults but needs future knowledge, and LRU approximates it. Thrashing occurs when processes spend more time paging than executing.'),
      ]),
    note('n7', 'f3', 'Computer Networks', '21CS52', 5, 'CSE', 3, 'Network layer: IP addressing and routing',
      'Subnetting and CIDR numericals, distance vector and link state routing with worked tables, plus ARP, ICMP and NAT.',
      24, 120, 4.9, 264, 3105, [
        T('IPv4 addressing and subnetting', 'An IPv4 address is 32 bits, split into a network part and a host part by the subnet mask. A /26 prefix leaves 6 host bits, giving 64 addresses and 62 usable hosts per subnet.'),
        T('CIDR and supernetting', 'Classless inter-domain routing writes a block as address/prefix-length and lets routers aggregate contiguous blocks into one route, which keeps routing tables small.'),
        T('Distance vector routing', 'Each router shares its distance table with its neighbours and applies the Bellman-Ford update. It is simple but suffers from the count-to-infinity problem, which split horizon and poison reverse reduce.'),
        T('Link state routing', 'Each router floods the state of its links to all routers, so every router builds the same map and runs Dijkstra\'s algorithm on it. OSPF is the standard example.'),
        T('ARP, ICMP and NAT', 'ARP maps an IP address to a MAC address on the local network. ICMP reports errors and supports ping and traceroute. NAT lets many private hosts share one public address.'),
      ]),
    note('n8', 'f4', 'Engineering Mathematics III', '3130005', 3, 'ME', 1, 'Laplace transforms and their applications',
      'Standard transforms, both shifting theorems, transforms of derivatives, inverse transforms and solving ODEs, with 40 solved problems.',
      30, 80, 4.3, 402, 4480, [
        T('Definition and existence', 'The Laplace transform of f(t) is the integral from 0 to infinity of e^(-st) f(t) dt. It exists when f is piecewise continuous and of exponential order.'),
        T('Standard transforms', 'L{1} = 1/s, L{t^n} = n!/s^(n+1), L{e^(at)} = 1/(s - a), L{sin at} = a/(s^2 + a^2) and L{cos at} = s/(s^2 + a^2).'),
        T('Shifting theorems', 'First shifting: L{e^(at) f(t)} = F(s - a). Second shifting: L{f(t - a) u(t - a)} = e^(-as) F(s), where u is the unit step function.'),
        T('Transforms of derivatives and integrals', 'L{f\'(t)} = sF(s) - f(0) and L{f\'\'(t)} = s^2 F(s) - s f(0) - f\'(0). Integrating f from 0 to t divides the transform by s.'),
        T('Inverse transforms and convolution', 'Inverse transforms are found by partial fractions or by the convolution theorem, which states that the inverse of F(s)G(s) is the convolution of f and g.'),
      ]),
    note('n9', 'f5', 'Digital Electronics', 'KEC302', 3, 'ECE', 2, 'Combinational circuits and K-maps',
      'K-map simplification up to four variables, adders, multiplexers, decoders and code converters with truth tables and gate diagrams.',
      18, 100, 4.5, 133, 1710, [
        T('Boolean simplification with K-maps', 'A Karnaugh map arranges minterms so that adjacent cells differ in one variable. Grouping 1s in blocks of 1, 2, 4 or 8 removes the variables that change within the group.'),
        T('Adders and subtractors', 'A half adder gives sum = A XOR B and carry = A AND B. A full adder also takes a carry-in, and a 4-bit ripple carry adder chains four full adders.'),
        T('Multiplexers and demultiplexers', 'A 2^n-to-1 multiplexer selects one of 2^n inputs using n select lines, and it can implement any Boolean function of n variables directly.'),
        T('Encoders and decoders', 'An n-to-2^n decoder activates exactly one output for each input code. A priority encoder outputs the code of the highest-priority active input.'),
        T('Comparators and code converters', 'A magnitude comparator outputs A > B, A = B and A < B. Binary to Gray conversion keeps the most significant bit and XORs each remaining pair of adjacent bits.'),
      ]),
    note('n10', 'f6', 'Thermodynamics', 'MET202', 4, 'ME', 5, 'Power cycles and refrigeration',
      'Carnot, Rankine, Otto and Diesel cycles on P-v and T-s diagrams, the vapour compression cycle and COP numericals.',
      21, 110, 4.6, 88, 1190, [
        T('Carnot cycle', 'The Carnot cycle has two isothermal and two adiabatic reversible processes. Its efficiency, 1 - T_cold/T_hot with temperatures in kelvin, is the upper limit for any engine working between the same two reservoirs.'),
        T('Rankine cycle', 'The ideal Rankine cycle pumps liquid water, boils it at constant pressure, expands the steam in a turbine and condenses it. Superheating and reheating raise efficiency and reduce moisture at the turbine exit.'),
        T('Otto and Diesel cycles', 'Otto efficiency is 1 - 1/r^(gamma - 1), which depends only on the compression ratio r. For the same compression ratio the Diesel cycle is less efficient, but diesel engines run at higher ratios.'),
        T('Vapour compression refrigeration', 'The cycle has compression, condensation, throttling and evaporation. The coefficient of performance equals the refrigerating effect divided by the compressor work.'),
        T('Refrigerants and psychrometry', 'A good refrigerant has a high latent heat, a suitable boiling point and low environmental impact. Psychrometry relates the dry-bulb temperature, wet-bulb temperature and humidity of moist air.'),
      ]),
  ];

  /** Builds purchases and reading sessions for the signed-in faculty's units so the dashboard has data on first load. */
  function seedActivity(notes) {
    const rnd = mulberry32(20261003);
    const now = Date.now();
    const hourPool = [21, 22, 20, 23, 21, 19, 22, 7, 6, 15, 17, 0, 21, 20, 22];
    const methods = ['UPI', 'UPI', 'UPI QR', 'Net banking'];
    const purchases = [];
    const sessions = [];

    notes.filter((n) => n.facultyId === ME_FACULTY).forEach((n) => {
      SEED_STUDENTS.filter(() => rnd() < 0.72).forEach((s) => {
        const daysAgo = 3 + Math.floor(rnd() * 18);
        const boughtAt = now - daysAgo * DAY - Math.floor(rnd() * DAY * 0.4);
        purchases.push({
          id: uid('pur'), noteId: n.id, studentId: s.id, amount: n.price,
          method: methods[Math.floor(rnd() * methods.length)],
          paymentId: 'pay_' + Math.floor(rnd() * 1e12).toString(36).toUpperCase(),
          invoiceNo: 'MN-' + (10000 + Math.floor(rnd() * 89999)), at: boughtAt,
        });
        const count = rnd() < 0.1 ? 0 : 1 + Math.floor(rnd() * 5);
        let progress = 0;
        for (let k = 0; k < count; k++) {
          const d = new Date(boughtAt + ((k + rnd()) * daysAgo * DAY) / (count + 1));
          d.setHours(hourPool[Math.floor(rnd() * hourPool.length)], Math.floor(rnd() * 60), 0, 0);
          let startedAt = d.getTime();
          if (startedAt < boughtAt) startedAt = boughtAt + Math.floor(rnd() * 3_600_000);
          if (startedAt > now - 3_600_000) startedAt = now - 3_600_000 - Math.floor(rnd() * 5 * 3_600_000);
          const activeSec = Math.round(360 + rnd() * 2700);
          progress = Math.min(100, Math.round(progress + 15 + rnd() * 45));
          sessions.push({
            id: uid('ses'), noteId: n.id, studentId: s.id, startedAt,
            endedAt: startedAt + Math.round(activeSec * 1000 * (1.08 + rnd() * 0.3)),
            activeSec, progress,
          });
        }
      });
    });
    return { purchases, sessions };
  }

  function buildSeedState() {
    const notes = structuredClone(SEED_NOTES).map((n, i) => ({ ...n, createdAt: Date.now() - (40 - i) * DAY }));
    const { purchases, sessions } = seedActivity(notes);
    const net = sum(purchases, (p) => p.amount) * (1 - COMMISSION_RATE);
    const payouts = net > 1500
      ? [{ id: uid('po'), amount: 1000, at: Date.now() - 9 * DAY, ref: 'PO-48213', to: SEED_FACULTY.f1.bank }]
      : [];
    return {
      version: 1,
      role: 'student',
      student: { name: 'Aarav Sharma', email: 'aarav.sharma@example.com', phone: '98765 43210' },
      faculty: structuredClone(SEED_FACULTY),
      students: Object.fromEntries(SEED_STUDENTS.map((s) => [s.id, s])),
      notes, purchases, sessions, payouts,
      reviews: [],
      bookmarks: {},      // noteId -> [page numbers]
      scratch: {},        // noteId -> text
      readerPos: {},      // noteId -> scroll ratio (0..1)
      readerTheme: 'paper',
    };
  }

  /* ---------- 3. Store ---------- */
  let state;
  const Store = {
    persistent: true,
    load() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { this.persistent = false; }
      state = saved && saved.version === 1 ? saved : buildSeedState();
      if (!saved) this.save();
    },
    save() {
      if (!this.persistent) return;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
      catch { this.persistent = false; Toast.show('This browser is blocking storage, so changes will last only until you close the tab.', 'err'); }
    },
    reset() {
      try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
      state = buildSeedState();
      this.save();
    },
  };

  /* ---------- 4. Selectors ---------- */
  const getNote = (id) => state.notes.find((n) => n.id === id);
  const facultyOf = (n) => state.faculty[n.facultyId];
  const purchasesOf = (noteId) => state.purchases.filter((p) => p.noteId === noteId);
  const sessionsOf = (noteId) => state.sessions.filter((s) => s.noteId === noteId);
  const myPurchase = (noteId) => state.purchases.find((p) => p.noteId === noteId && p.studentId === ME_STUDENT);
  const isOwned = (noteId) => Boolean(myPurchase(noteId));
  const readsOf = (n) => n.reads + sessionsOf(n.id).length;
  const studentName = (id) => (id === ME_STUDENT ? state.student.name : state.students[id]?.name ?? 'Student');
  const ratingOf = (n) => {
    const extra = state.reviews.filter((r) => r.noteId === n.id);
    const count = n.ratingCount + extra.length;
    return { count, avg: count ? (n.rating * n.ratingCount + sum(extra, (r) => r.stars)) / count : 0 };
  };
  const watermarkText = () => `${state.student.email}  |  ${state.student.phone}`;

  /** Per-document engagement figures used by the faculty analytics tab. */
  function engagementFor(noteId) {
    const sess = sessionsOf(noteId);
    const buyers = [...new Set(purchasesOf(noteId).map((p) => p.studentId))];
    const totalSec = sum(sess, (s) => s.activeSec);
    const students = buyers.map((id) => {
      const own = sess.filter((s) => s.studentId === id).sort((a, b) => b.startedAt - a.startedAt);
      return {
        id, name: studentName(id), sessions: own,
        sec: sum(own, (s) => s.activeSec),
        progress: own.length ? Math.max(...own.map((s) => s.progress)) : 0,
        last: own[0]?.startedAt ?? null,
      };
    }).sort((a, b) => b.sec - a.sec);

    const reached = (pct) => students.filter((s) => s.progress >= pct).length;
    const finished = reached(95);
    const hours = Array(24).fill(0);
    sess.forEach((s) => { hours[new Date(s.startedAt).getHours()] += s.activeSec; });
    let peak = 0;
    for (let h = 1; h < 24; h++) if (hours[h] + hours[(h + 1) % 24] > hours[peak] + hours[(peak + 1) % 24]) peak = h;

    return {
      buyers: buyers.length, sessions: sess.length, totalSec,
      avgSec: buyers.length ? totalSec / buyers.length : 0,
      students, hours, peak, hasReads: totalSec > 0,
      dropoff: buyers.length ? 1 - finished / buyers.length : 0,
      funnel: [
        ['Unlocked', buyers.length],
        ['Opened', students.filter((s) => s.sessions.length).length],
        ['Reached 25%', reached(25)],
        ['Reached 50%', reached(50)],
        ['Reached 75%', reached(75)],
        ['Finished', finished],
      ],
    };
  }

  /** Revenue figures across all of the signed-in faculty's units. */
  function earnings() {
    const mine = state.notes.filter((n) => n.facultyId === ME_FACULTY);
    const ids = new Set(mine.map((n) => n.id));
    const sales = state.purchases.filter((p) => ids.has(p.noteId)).sort((a, b) => b.at - a.at);
    const gross = sum(sales, (p) => p.amount);
    const commission = Math.round(gross * COMMISSION_RATE);
    const net = gross - commission;
    const paid = sum(state.payouts, (p) => p.amount);
    return { mine, sales, gross, commission, net, paid, available: Math.max(0, net - paid) };
  }

  /* ---------- 5. Document content ---------- */
  function topicBlocks(tp, part, n) {
    switch (part % 4) {
      case 0: return [
        { t: 'h2', text: tp.name },
        { t: 'p', text: tp.gist },
        { t: 'h3', text: 'How to approach this topic' },
        { t: 'p', text: 'Start from the definition, then test it on the smallest example you can build by hand. Write the idea in one line of your own before you memorise any standard wording: marks are awarded for the reasoning, and a precise one-line statement anchors the rest of the answer.' },
        { t: 'note', text: 'Exam pointer: long questions from this topic usually carry 7 to 10 marks. Lead with the definition, add a labelled diagram or example, and close with one limitation.' },
      ];
      case 1: return [
        { t: 'h2', text: `${tp.name}: worked outline` },
        { t: 'p', text: 'Use this five-step outline for any long-answer question from this topic.' },
        { t: 'oli', text: 'State the definition in one or two precise sentences.' },
        { t: 'oli', text: 'Draw and label the standard diagram, table or structure.' },
        { t: 'oli', text: 'Work one small example by hand and show each intermediate step.' },
        { t: 'oli', text: 'State the result, cost or condition you arrive at, with correct notation or units.' },
        { t: 'oli', text: 'Close with one advantage, one limitation and one typical application.' },
        { t: 'p', text: `Keep this in view while you practise. ${tp.gist}` },
      ];
      case 2: return [
        { t: 'h2', text: `${tp.name}: common mistakes` },
        { t: 'li', text: 'Quoting a result without the condition under which it holds.' },
        { t: 'li', text: 'Skipping intermediate steps in a derivation or trace. Step marks are lost even when the final answer is right.' },
        { t: 'li', text: 'Mixing up closely related terms. Write the two definitions side by side once and the confusion goes away.' },
        { t: 'li', text: 'Leaving diagrams unlabelled, or ending an example without a clearly stated final answer.' },
        { t: 'note', text: 'Revision tip: explain this topic aloud in under two minutes without looking at the page. Whatever you hesitate on is what to reread.' },
      ];
      default: return [
        { t: 'h2', text: `${tp.name}: practice questions` },
        { t: 'oli', text: 'Define the key terms of this topic and give one example of each. (2 marks)' },
        { t: 'oli', text: 'Explain the main idea with a neat diagram or a traced example. (5 marks)' },
        { t: 'oli', text: 'Solve one numerical or step-by-step problem on this topic from a previous year paper. (7 marks)' },
        { t: 'oli', text: `Compare this topic with the one before it in Unit ${n.unit} on two points. (5 marks)` },
        { t: 'p', text: 'Attempt these with the page closed, then check your answers against the worked outline.' },
      ];
    }
  }

  /** Returns the simulated document as [{ n, blocks }]. The same blocks feed the reader, the preview and the PDF. */
  function buildPages(n) {
    const fac = facultyOf(n);
    const topics = n.topics?.length ? n.topics : [T(n.title, n.description)];
    const total = Math.max(3, n.pages);
    const pages = [{
      n: 1,
      blocks: [
        { t: 'kicker', text: `${n.subject} (${n.code}), Unit ${n.unit}` },
        { t: 'h1', text: n.title },
        { t: 'p', text: n.description },
        { t: 'meta', text: `Prepared by ${fac.name}, ${fac.college}. Semester ${n.sem}, ${n.branch}.` },
        { t: 'h3', text: 'In this unit' },
        ...topics.map((tp) => ({ t: 'li', text: tp.name })),
      ],
    }];
    const body = total - 1;
    const seen = {};
    for (let i = 0; i < body; i++) {
      const ti = Math.min(topics.length - 1, Math.floor((i * topics.length) / body));
      seen[ti] = (seen[ti] ?? -1) + 1;
      pages.push({ n: i + 2, blocks: topicBlocks(topics[ti], seen[ti], n) });
    }
    return pages;
  }

  function blocksToHtml(blocks) {
    let html = '';
    let list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    const open = (tag) => { if (list !== tag) { close(); html += `<${tag}>`; list = tag; } };
    for (const b of blocks) {
      const text = esc(b.text);
      if (b.t === 'li') { open('ul'); html += `<li>${text}</li>`; continue; }
      if (b.t === 'oli') { open('ol'); html += `<li>${text}</li>`; continue; }
      close();
      if (b.t === 'kicker') html += `<p class="doc-kicker">${text}</p>`;
      else if (b.t === 'h1') html += `<h2 class="doc-title">${text}</h2>`;
      else if (b.t === 'h2') html += `<h3>${text}</h3>`;
      else if (b.t === 'h3') html += `<h4>${text}</h4>`;
      else if (b.t === 'meta') html += `<p class="doc-meta">${text}</p>`;
      else if (b.t === 'note') html += `<p class="doc-note">${text}</p>`;
      else html += `<p>${text}</p>`;
    }
    close();
    return html;
  }

  const pageHtml = (page, total, { licensed }) => `
    <article class="page" id="pg-${page.n}" data-page="${page.n}" data-wm="${esc(licensed ? watermarkText() : 'MyNotes sample')}">
      <div class="page-body">${blocksToHtml(page.blocks)}</div>
      <footer class="page-foot">
        <span>${licensed ? `Licensed to ${esc(state.student.name)}` : 'Free sample'}</span>
        <span>Page ${page.n} of ${total}</span>
      </footer>
    </article>`;

  /* ---------- 6. Pdf: a minimal writer for text-only A4 PDFs ---------- */
  const Pdf = {
    ascii: (s) => String(s)
      .replace(/₹\s?/g, 'Rs. ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E]/g, '?'),
    lit(s) { return '(' + this.ascii(s).replace(/([\\()])/g, '\\$1') + ')'; },
    text(x, y, size, s, bold = false) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${this.lit(s)} Tj ET\n`; },
    wrap(s, max) {
      const lines = [];
      let line = '';
      for (const word of this.ascii(s).split(/\s+/)) {
        if (line && (line + ' ' + word).length > max) { lines.push(line); line = word; }
        else line = line ? line + ' ' + word : word;
      }
      if (line) lines.push(line);
      return lines;
    },
    watermark(s) {
      return `q 0.9 g BT /F2 24 Tf 0.766 0.643 -0.643 0.766 90 250 Tm ${this.lit(s)} Tj ET Q\n`;
    },
    /** Assembles content streams into a PDF Blob. All text is ASCII, so string length equals byte length. */
    build(streams) {
      const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${streams.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${streams.length} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      ];
      streams.forEach((s, i) => {
        objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
        objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
      });
      let out = '%PDF-1.4\n';
      const offsets = [];
      objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
      out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
      out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
      return new Blob([out], { type: 'application/pdf' });
    },
    /** The unit as a watermarked PDF. */
    notes(n) {
      const pages = buildPages(n);
      const left = 60;
      const styles = {
        kicker: [10, true, 80, 0, 6], h1: [21, true, 42, 0, 12], h2: [16, true, 54, 0, 10], h3: [12, true, 72, 0, 4],
        p: [11, false, 92, 0, 8], meta: [9.5, false, 100, 0, 12], note: [10, false, 96, 10, 8], li: [11, false, 86, 14, 3], oli: [11, false, 86, 14, 3],
      };
      const streams = pages.map((pg) => {
        let s = this.watermark(watermarkText());
        let y = 772;
        let num = 0;
        for (const b of pg.blocks) {
          const [size, bold, max, indent, gap] = styles[b.t] ?? styles.p;
          if (b.t.startsWith('h')) y -= 8;
          const prefix = b.t === 'li' ? '-  ' : b.t === 'oli' ? `${++num}.  ` : '';
          this.wrap(b.text, max).forEach((line, i) => {
            if (y < 80) return;
            s += this.text(left + indent, y, size, (i === 0 ? prefix : prefix ? '    ' : '') + line, bold);
            y -= Math.round(size * 1.5);
          });
          y -= gap;
        }
        s += this.text(left, 46, 8, `Licensed to ${state.student.name} (${state.student.email}, ${state.student.phone}). Sharing this file is traceable to this licence.`);
        s += this.text(left, 34, 8, `MyNotes  |  ${n.code} Unit ${n.unit}  |  Page ${pg.n} of ${pages.length}`);
        return s;
      });
      return this.build(streams);
    },
    invoice(n, purchase) {
      const fac = facultyOf(n);
      let s = '';
      let y = 780;
      const row = (label, value, bold = false) => { s += this.text(60, y, 11, label, bold) + this.text(240, y, 11, value, bold); y -= 22; };
      s += this.text(60, y, 22, 'MyNotes', true); y -= 26;
      s += this.text(60, y, 11, 'Tax invoice / payment receipt (simulated)'); y -= 40;
      row('Invoice number', purchase.invoiceNo);
      row('Date', `${fmtDate(purchase.at)}, ${fmtTime(purchase.at)}`);
      row('Payment ID', purchase.paymentId);
      row('Payment method', purchase.method);
      y -= 12;
      row('Billed to', state.student.name, true);
      row('Email', state.student.email);
      row('Phone', state.student.phone);
      y -= 12;
      row('Item', `${n.subject} (${n.code}), Unit ${n.unit}`, true);
      this.wrap(n.title, 52).forEach((line, i) => row(i ? '' : 'Title', line));
      row('Author', `${fac.name}, ${fac.uni}`);
      row('Licence', 'Single user, watermarked PDF');
      y -= 12;
      row('Amount paid', `Rs. ${purchase.amount}.00 (inclusive of all taxes)`, true);
      y -= 30;
      s += this.text(60, y, 9, 'This is a demo receipt generated in your browser. No money was collected.');
      return this.build([s]);
    },
  };

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const downloadNotes = (n) => downloadBlob(Pdf.notes(n), `${n.code}-unit-${n.unit}-${slug(n.title)}.pdf`);
  const downloadInvoice = (n) => { const p = myPurchase(n.id); if (p) downloadBlob(Pdf.invoice(n, p), `invoice-${p.invoiceNo}.pdf`); };

  /* ---------- 7. Toast and Modal ---------- */
  const Toast = {
    el: $('#toasts'),
    show(msg, kind = '') {
      // Modal dialogs render in the top layer, so the toast region moves into whichever dialog is on top.
      const modal = $('#modal'), reader = $('#reader');
      const host = modal.open ? modal : reader.open ? reader : document.body;
      if (this.el.parentElement !== host) host.append(this.el);
      const t = document.createElement('div');
      t.className = `toast ${kind}`;
      t.textContent = msg;
      this.el.append(t);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3600);
    },
  };

  const Modal = {
    el: $('#modal'),
    body: $('#modalBody'),
    token: 0,          // changes whenever the content is replaced or closed; async flows compare against it
    open(html, { wide = false, label = 'Dialog' } = {}) {
      this.token++;
      this.body.innerHTML = html;
      this.el.classList.toggle('wide', wide);
      this.el.setAttribute('aria-label', label);
      if (!this.el.open) this.el.showModal();
      this.body.scrollTop = 0;
      (this.body.querySelector('[autofocus]') ?? $('#modalClose')).focus({ preventScroll: true });
      return this.token;
    },
    update(html) { this.body.innerHTML = html; },
    lock(on) { this.el.classList.toggle('is-locked', on); },
    get locked() { return this.el.classList.contains('is-locked'); },
    close() { if (this.el.open) this.el.close(); },
    init() {
      $('#modalClose').addEventListener('click', () => this.close());
      this.el.addEventListener('cancel', (e) => { if (this.locked) e.preventDefault(); });
      this.el.addEventListener('click', (e) => { if (e.target === this.el && !this.locked) this.close(); });
      this.el.addEventListener('close', () => { this.token++; this.lock(false); this.body.innerHTML = ''; });
    },
  };

  /* ---------- 8. Catalog ---------- */
  const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

  const Catalog = {
    filters: { q: '', unit: 'all', sem: 'all', branch: 'all', sort: 'popular', owned: false },

    visible() {
      const f = this.filters;
      const q = f.q.trim().toLowerCase();
      const list = state.notes.filter((n) => {
        if (f.unit !== 'all' && n.unit !== Number(f.unit)) return false;
        if (f.sem !== 'all' && n.sem !== Number(f.sem)) return false;
        if (f.branch !== 'all' && n.branch !== f.branch) return false;
        if (f.owned && !isOwned(n.id)) return false;
        if (!q) return true;
        const fac = facultyOf(n);
        return [n.subject, n.code, n.title, fac.name, fac.college, fac.uni, ...(n.topics ?? []).map((t) => t.name)]
          .join(' ').toLowerCase().includes(q);
      });
      const by = {
        popular: (a, b) => readsOf(b) - readsOf(a),
        rating: (a, b) => ratingOf(b).avg - ratingOf(a).avg,
        'price-asc': (a, b) => a.price - b.price,
        'price-desc': (a, b) => b.price - a.price,
      };
      return list.sort(by[f.sort]);
    },

    card(n) {
      const fac = facultyOf(n);
      const owned = isOwned(n.id);
      const r = ratingOf(n);
      const rating = r.count
        ? `<span>${STAR}<strong>${r.avg.toFixed(1)}</strong> (${r.count})</span>`
        : '<span class="badge badge-warn">New</span>';
      return `
      <article class="note-card tilt" data-id="${n.id}">
        <div class="card-head">
          <div class="unit-glyph" aria-hidden="true">${n.unit}</div>
          <div class="card-head-text">
            <div class="card-badges">
              <span class="badge badge-uni">${esc(fac.uni)}</span>
              <span class="badge badge-unit">Unit ${n.unit}</span>
              ${owned ? '<span class="badge badge-ok">Unlocked</span>' : ''}
            </div>
            <h3>${esc(n.title)}</h3>
          </div>
        </div>
        <p class="card-subject">${esc(n.subject)} (${esc(n.code)}), Semester ${n.sem}, ${esc(n.branch)}</p>
        <div class="card-faculty">
          <span class="avatar" aria-hidden="true">${esc(initials(fac.name))}</span>
          <span><strong>${esc(fac.name)}</strong>${esc(fac.college)}</span>
        </div>
        <div class="card-meta">
          ${rating}
          <span><strong>${n.pages}</strong> pages, ${FREE_PAGES} free</span>
          <span><strong>${fmtCount(readsOf(n))}</strong> reads</span>
        </div>
        <div class="card-foot">
          <div class="price">${owned ? '<small>Paid</small>' : ''}${inr(n.price)}</div>
          ${owned
            ? `<button type="button" class="btn btn-ghost" data-action="download" aria-label="Download ${esc(n.title)} as PDF">Download</button>
               <button type="button" class="btn btn-success" data-action="read">Open reader</button>`
            : `<button type="button" class="btn btn-ghost" data-action="preview">Preview</button>
               <button type="button" class="btn btn-primary" data-action="buy">Unlock for ${inr(n.price)}</button>`}
        </div>
      </article>`;
    },

    render() {
      const list = this.visible();
      const grid = $('#catalog');
      grid.innerHTML = list.map((n) => this.card(n)).join('');
      $('#emptyState').hidden = list.length > 0;
      $('#resultCount').textContent = list.length
        ? `${list.length} ${list.length === 1 ? 'unit' : 'units'}${this.filters.owned ? ' in your library' : ' available'}`
        : '';
      attachTilt(grid);
    },

    init() {
      let debounce;
      $('#searchInput').addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { this.filters.q = e.target.value; this.render(); }, 120);
      });
      $('#unitChips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-unit]');
        if (!chip) return;
        this.filters.unit = chip.dataset.unit;
        $$('#unitChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        this.render();
      });
      $('#semSelect').addEventListener('change', (e) => { this.filters.sem = e.target.value; this.render(); });
      $('#branchSelect').addEventListener('change', (e) => { this.filters.branch = e.target.value; this.render(); });
      $('#sortSelect').addEventListener('change', (e) => { this.filters.sort = e.target.value; this.render(); });
      $('#libraryToggle').addEventListener('click', (e) => {
        this.filters.owned = !this.filters.owned;
        e.currentTarget.setAttribute('aria-pressed', String(this.filters.owned));
        this.render();
      });
      $('#clearFilters').addEventListener('click', () => {
        this.filters = { q: '', unit: 'all', sem: 'all', branch: 'all', sort: this.filters.sort, owned: false };
        $('#searchInput').value = '';
        $('#semSelect').value = 'all';
        $('#branchSelect').value = 'all';
        $('#libraryToggle').setAttribute('aria-pressed', 'false');
        $$('#unitChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.unit === 'all')));
        this.render();
      });
      $('#catalog').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const n = getNote(btn.closest('[data-id]').dataset.id);
        ({ preview: () => Preview.open(n), buy: () => Checkout.open(n), read: () => Reader.open(n), download: () => { downloadNotes(n); Toast.show('Download started', 'ok'); } })[btn.dataset.action]?.();
      });
    },
  };

  /** Pointer-driven 3D tilt. Skipped on touch devices and when reduced motion is requested. */
  function attachTilt(root) {
    if (!hasFineHover || prefersReducedMotion) return;
    $$('.tilt', root).forEach((el) => {
      const max = el.classList.contains('stat') ? 5 : 7;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.classList.add('is-tilting');
        el.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`);
        el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(0)}%`);
        el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(0)}%`);
      });
      el.addEventListener('pointerleave', () => {
        el.classList.remove('is-tilting');
        ['--rx', '--ry', '--gx', '--gy'].forEach((p) => el.style.removeProperty(p));
      });
    });
  }

  /* ---------- 9. Preview and Checkout ---------- */
  const Preview = {
    open(n) {
      const pages = buildPages(n);
      const sample = pages.slice(0, FREE_PAGES).map((p) => pageHtml(p, pages.length, { licensed: false })).join('');
      Modal.open(`
        <h2 class="modal-title">Free sample</h2>
        <p class="modal-sub">${esc(n.title)}. First ${FREE_PAGES} of ${pages.length} pages.</p>
        <div class="preview-scroll paper-scope" data-theme="paper" tabindex="0" aria-label="Sample pages"><div class="pages">${sample}</div></div>
        <div class="preview-lock">
          <strong>${pages.length - FREE_PAGES} more pages in this unit</strong>
          <p>Unlock to read the full unit here and download the PDF.</p>
          <button type="button" class="btn btn-primary btn-lg" data-action="buy" data-id="${n.id}">Pay ${inr(n.price)} to unlock and download</button>
        </div>`, { wide: true, label: `Free sample of ${n.title}` });
    },
  };

  const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank'];
  const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
  const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const SHIELD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z"/></svg>';

  /** Draws a QR-style matrix from a string. It is decorative: it looks like a QR code but does not encode a payable UPI link. */
  function fauxQr(seedText) {
    const size = 25;
    const rnd = mulberry32(hashStr(seedText));
    const inFinder = (x, y) => (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
    let rects = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!inFinder(x, y) && rnd() > 0.52) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    for (const [fx, fy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      rects += `<path fill-rule="evenodd" d="M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}v5h5v-5z"/><rect x="${fx + 2}" y="${fy + 2}" width="3" height="3"/>`;
    }
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Demo QR code" shape-rendering="crispEdges">${rects}</svg>`;
  }

  const Checkout = {
    note: null, method: 'upi', upiId: '', bank: '', error: '',

    open(n) {
      if (isOwned(n.id)) return Reader.open(n);
      Object.assign(this, { note: n, method: 'upi', upiId: '', bank: '', error: '' });
      this.renderForm();
    },

    pane() {
      if (this.method === 'upi') return `
        <label class="field"><span>Your UPI ID</span>
          <input type="text" id="upiId" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="name@bank" value="${esc(this.upiId)}" autofocus>
        </label>
        <div class="upi-apps" aria-label="Fill a demo UPI ID">
          ${['okhdfcbank', 'ybl', 'paytm', 'okaxis'].map((h) => `<button type="button" data-action="upi-fill" data-handle="${h}">@${h}</button>`).join('')}
        </div>
        <p class="hint">A collect request is sent to your UPI app. In this demo, an ID starting with “fail@” shows a declined payment.</p>`;
      if (this.method === 'qr') return `
        <div class="qr-wrap">
          <div class="qr">${fauxQr(this.note.id + state.student.email)}</div>
          <p><strong>Scan with any UPI app</strong><br>Paying ${inr(this.note.price)} to MyNotes. This demo QR is not payable, so use the button below to simulate the scan.</p>
        </div>`;
      return `
        <fieldset style="border:0;padding:0;margin:0">
          <legend class="sr-only">Choose your bank</legend>
          <div class="banks">
            ${BANKS.map((b) => `<label><input type="radio" name="bank" value="${esc(b)}" ${this.bank === b ? 'checked' : ''}>${esc(b)}</label>`).join('')}
          </div>
        </fieldset>`;
    },

    renderForm() {
      const n = this.note;
      const tabs = [['upi', 'UPI ID'], ['qr', 'QR code'], ['nb', 'Net banking']];
      const cta = this.method === 'qr' ? `I have scanned and paid ${inr(n.price)}` : `Pay ${inr(n.price)} to unlock and download`;
      Modal.open(`
        <h2 class="modal-title">Unlock this unit</h2>
        <div class="order">
          <div><strong>${esc(n.title)}</strong><span>${esc(n.subject)}, Unit ${n.unit}, ${n.pages} pages</span></div>
          <div class="price">${inr(n.price)}</div>
        </div>
        <form data-form="pay" novalidate>
          <div class="pay-tabs" role="tablist" aria-label="Payment method">
            ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this.method === id}" data-action="pay-method" data-method="${id}">${label}</button>`).join('')}
          </div>
          <div class="pay-pane" role="tabpanel" aria-label="Payment details">${this.pane()}</div>
          <p class="form-error" role="alert" ${this.error ? '' : 'hidden'}>${esc(this.error)}</p>
          <div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">${cta}</button></div>
          <p class="secure-line">${SHIELD_ICON} Simulated Razorpay-style checkout. No real money moves.</p>
        </form>`, { label: 'Checkout' });
    },

    captureInputs() {
      const upi = $('#upiId', Modal.body);
      if (upi) this.upiId = upi.value.trim();
      const bank = $('input[name="bank"]:checked', Modal.body);
      if (bank) this.bank = bank.value;
    },

    submit() {
      this.captureInputs();
      this.error = '';
      if (this.method === 'upi' && !UPI_RE.test(this.upiId)) this.error = 'Enter a valid UPI ID, for example aarav@okhdfcbank.';
      if (this.method === 'nb' && !this.bank) this.error = 'Choose your bank to continue.';
      if (this.error) return this.renderForm();
      this.process();
    },

    async process() {
      const n = this.note;
      const labels = {
        upi: [`Sending a collect request to ${this.upiId}`, 'Waiting for approval in your UPI app', 'Verifying the payment with the bank', 'Unlocking your unit'],
        qr: ['Checking for the scanned payment', 'Payment received from the UPI app', 'Verifying the payment with the bank', 'Unlocking your unit'],
        nb: [`Connecting to ${this.bank}`, 'Authorising the payment', 'Verifying the payment with the bank', 'Unlocking your unit'],
      }[this.method];
      const willFail = this.method === 'upi' && /^fail@/i.test(this.upiId);
      const draw = (active, failed = false) => Modal.update(`
        <h2 class="modal-title">Processing ${inr(n.price)}</h2>
        <p class="modal-sub">Keep this window open. This takes a few seconds.</p>
        <ol class="steps" aria-live="polite">
          ${labels.map((l, i) => `<li class="${i < active ? 'is-done' : i === active ? (failed ? 'is-failed' : 'is-active') : ''}"><span class="mark" aria-hidden="true"></span>${esc(l)}</li>`).join('')}
        </ol>`);

      Modal.lock(true);
      const token = ++Modal.token;
      for (let i = 0; i < labels.length; i++) {
        draw(i);
        await wait(i === 1 ? 1500 : 900);
        if (token !== Modal.token) return;
        if (willFail && i === 1) return this.fail('The collect request was declined in the UPI app. No money was debited.');
      }
      this.succeed();
    },

    fail(reason) {
      Modal.lock(false);
      Modal.update(`
        <div class="result">
          <div class="result-icon fail"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></div>
          <h2>Payment not completed</h2>
          <p class="modal-sub" style="padding:0">${esc(reason)}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-action="close">Cancel</button>
            <button type="button" class="btn btn-primary" data-action="pay-retry" autofocus>Try another method</button>
          </div>
        </div>`);
    },

    succeed() {
      const n = this.note;
      const purchase = {
        id: uid('pur'), noteId: n.id, studentId: ME_STUDENT, amount: n.price,
        method: { upi: `UPI (${this.upiId})`, qr: 'UPI QR', nb: `Net banking (${this.bank})` }[this.method],
        paymentId: 'pay_' + Math.random().toString(36).slice(2, 16).toUpperCase(),
        invoiceNo: 'MN-' + String(Date.now()).slice(-7), at: Date.now(),
      };
      state.purchases.push(purchase);
      Store.save();
      Catalog.render();
      Modal.lock(false);
      Modal.update(`
        <div class="result">
          <div class="result-icon">${CHECK_ICON}</div>
          <h2>Paid. Your unit is unlocked.</h2>
          <p class="modal-sub" style="padding:0">Your PDF download starts automatically.</p>
          <dl class="receipt">
            <div><dt>Amount paid</dt><dd>${inr(purchase.amount)}</dd></div>
            <div><dt>Method</dt><dd>${esc(purchase.method)}</dd></div>
            <div><dt>Payment ID</dt><dd>${esc(purchase.paymentId)}</dd></div>
            <div><dt>Invoice</dt><dd>${esc(purchase.invoiceNo)}</dd></div>
          </dl>
          <p class="wm-notice">${SHIELD_ICON}<span>Your copy is watermarked with ${esc(state.student.email)} and ${esc(state.student.phone)} on every page, so shared copies can be traced to this licence.</span></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-success" data-action="read" data-id="${n.id}" autofocus>Open reader</button>
            <button type="button" class="btn btn-ghost" data-action="download" data-id="${n.id}">Download PDF again</button>
            <button type="button" class="btn btn-ghost" data-action="invoice" data-id="${n.id}">Download invoice</button>
          </div>
        </div>`);
      $('[autofocus]', Modal.body)?.focus();
      setTimeout(() => { downloadNotes(n); Toast.show('Download started', 'ok'); }, 700);
    },
  };

  /* ---------- 10. Reader with active reading-time tracker ---------- */
  const Reader = {
    el: $('#reader'), scrollEl: $('#readerScroll'),
    note: null, session: null, timer: null,
    lastActivity: 0, lastTick: 0, ticks: 0, currentPage: 1, pauseReason: '',

    open(n) {
      if (!isOwned(n.id)) return Checkout.open(n);
      Modal.close();
      this.note = n;
      const pages = buildPages(n);
      $('#readerTitle').textContent = n.title;
      $('#readerSub').textContent = `${n.subject} (${n.code}), Unit ${n.unit}, ${facultyOf(n).name}`;
      $('#readerPages').innerHTML = pages.map((p) => pageHtml(p, pages.length, { licensed: true })).join('')
        + '<p class="doc-end">End of unit</p>';
      $('#scratchpad').value = state.scratch[n.id] ?? '';
      $('#scratchSaved').textContent = '';
      $('#wmNotice').textContent = `Every page and your PDF carry ${state.student.email} and ${state.student.phone}.`;
      this.setTheme(state.readerTheme);
      this.setPanel(innerWidth >= 768);
      this.renderBookmarks();

      this.session = { id: uid('ses'), noteId: n.id, studentId: ME_STUDENT, startedAt: Date.now(), endedAt: Date.now(), activeSec: 0, progress: 0 };
      this.lastActivity = this.lastTick = Date.now();
      this.ticks = 0;
      this.el.showModal();

      // Resume where the student left off, once layout is known.
      requestAnimationFrame(() => {
        const max = this.scrollEl.scrollHeight - this.scrollEl.clientHeight;
        this.scrollEl.scrollTop = (state.readerPos[n.id] ?? 0) * max;
        this.onScroll();
        this.scrollEl.focus({ preventScroll: true });
      });
      this.timer = setInterval(() => this.tick(), 1000);
      this.paint();
    },

    /** Runs once a second. Time counts only while the tab is visible, focused and the reader has seen recent input. */
    tick() {
      const now = Date.now();
      const dt = Math.min((now - this.lastTick) / 1000, 2);   // cap so a throttled background tab cannot add a burst
      this.lastTick = now;
      const hidden = document.visibilityState !== 'visible' || !document.hasFocus();
      const idle = now - this.lastActivity > IDLE_LIMIT_MS;
      this.pauseReason = hidden ? 'Paused, tab not in focus' : idle ? 'Paused, no activity for 60 s' : '';
      if (!this.pauseReason) {
        this.session.activeSec += dt;
        this.session.endedAt = now;
      }
      this.paint();
      if (++this.ticks % 5 === 0) this.persist();
    },

    paint() {
      const pill = $('#sessionPill');
      pill.dataset.state = this.pauseReason ? 'paused' : 'active';
      $('#sessionTime').textContent = fmtClock(this.session.activeSec);
      $('#sessionState').textContent = this.pauseReason || 'Reading';
    },

    activity() { this.lastActivity = Date.now(); },

    /** Writes the running session into the shared sessions list that the faculty dashboard reads. */
    persist() {
      const s = this.session;
      if (!s || s.activeSec < 1) return;
      const copy = { ...s, activeSec: Math.round(s.activeSec) };
      const i = state.sessions.findIndex((x) => x.id === s.id);
      if (i >= 0) state.sessions[i] = copy; else state.sessions.push(copy);
      Store.save();
    },

    onScroll() {
      const el = this.scrollEl;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? clamp(el.scrollTop / max, 0, 1) : 1;
      const pct = Math.round(ratio * 100);
      const marker = el.scrollTop + el.clientHeight * 0.35;
      let page = 1;
      for (const p of $$('.page', el)) { if (p.offsetTop <= marker) page = Number(p.dataset.page); else break; }
      this.currentPage = page;
      if (this.session) this.session.progress = Math.max(this.session.progress, pct);
      if (this.note) state.readerPos[this.note.id] = ratio;

      $('#readerProgressFill').style.width = `${pct}%`;
      $('#readerProgress').setAttribute('aria-valuenow', String(pct));
      $('#progressText').textContent = `${pct}% read, page ${page}`;
      const marked = (state.bookmarks[this.note.id] ?? []).includes(page);
      const btn = $('#bookmarkBtn');
      btn.setAttribute('aria-pressed', String(marked));
      btn.setAttribute('aria-label', marked ? `Remove bookmark from page ${page}` : `Bookmark page ${page}`);
    },

    toggleBookmark(page = this.currentPage) {
      const list = new Set(state.bookmarks[this.note.id] ?? []);
      const adding = !list.has(page);
      adding ? list.add(page) : list.delete(page);
      state.bookmarks[this.note.id] = [...list].sort((a, b) => a - b);
      Store.save();
      this.renderBookmarks();
      this.onScroll();
      Toast.show(adding ? `Page ${page} bookmarked` : `Bookmark removed from page ${page}`);
    },

    renderBookmarks() {
      const marks = state.bookmarks[this.note.id] ?? [];
      $$('.page', this.el).forEach((p) => p.classList.toggle('is-bookmarked', marks.includes(Number(p.dataset.page))));
      $('#bookmarkList').innerHTML = marks.length
        ? marks.map((pg) => {
            const heading = $(`#pg-${pg} h3, #pg-${pg} .doc-title`, this.el)?.textContent ?? '';
            return `<li><button type="button" class="bm-go" data-page="${pg}">Page ${pg}${heading ? `, ${esc(heading)}` : ''}</button>
                    <button type="button" class="bm-del" data-page="${pg}" aria-label="Remove bookmark from page ${pg}">×</button></li>`;
          }).join('')
        : '<li class="none">No bookmarks yet. Use Bookmark to mark the page you are on.</li>';
    },

    setTheme(theme) {
      state.readerTheme = theme;
      this.el.dataset.theme = theme;
      $$('#themeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === theme)));
    },

    setPanel(open) {
      this.el.classList.toggle('panel-closed', !open);
      $('#panelBtn').setAttribute('aria-expanded', String(open));
    },

    close() { if (this.el.open) this.el.close(); },

    /** Runs on every close path, including Esc. */
    teardown() {
      clearInterval(this.timer);
      this.timer = null;
      this.persist();
      const s = this.session;
      this.session = null;
      Store.save();
      Catalog.render();
      if (s && s.activeSec >= 1) Toast.show(`Reading session saved: ${fmtDur(s.activeSec)} of active reading`, 'ok');
    },

    init() {
      const mark = () => this.activity();
      ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => this.el.addEventListener(ev, mark, { passive: true }));
      this.scrollEl.addEventListener('scroll', () => { this.activity(); this.onScroll(); }, { passive: true });
      document.addEventListener('visibilitychange', () => { if (this.session) { this.tick(); this.persist(); } });
      window.addEventListener('blur', () => { if (this.session) this.tick(); });
      window.addEventListener('focus', () => { if (this.session) { this.lastTick = Date.now(); this.activity(); this.tick(); } });
      window.addEventListener('pagehide', () => { if (this.session) this.persist(); });
      this.el.addEventListener('close', () => this.teardown());

      this.el.addEventListener('click', (e) => {
        const tool = e.target.closest('[data-reader]');
        if (tool) {
          ({
            close: () => this.close(),
            bookmark: () => this.toggleBookmark(),
            summary: () => Summary.open(this.note),
            rate: () => Rating.open(this.note),
            download: () => { downloadNotes(this.note); Toast.show('Download started', 'ok'); },
            panel: () => this.setPanel(this.el.classList.contains('panel-closed')),
          })[tool.dataset.reader]?.();
          return;
        }
        const theme = e.target.closest('[data-theme-set]');
        if (theme) { this.setTheme(theme.dataset.themeSet); Store.save(); return; }
        const go = e.target.closest('.bm-go');
        if (go) { $(`#pg-${go.dataset.page}`, this.el)?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' }); return; }
        const del = e.target.closest('.bm-del');
        if (del) this.toggleBookmark(Number(del.dataset.page));
      });

      let saveTimer;
      $('#scratchpad').addEventListener('input', (e) => {
        state.scratch[this.note.id] = e.target.value;
        $('#scratchSaved').textContent = 'Saving';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { Store.save(); $('#scratchSaved').textContent = 'Saved on this device'; }, 500);
      });
    },
  };

  /* ---------- 11. Summary, Rating, Profile ---------- */
  const firstSentence = (s) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s);

  const Summary = {
    open(n) {
      const token = Modal.open(`
        <h2 class="modal-title">Key concepts</h2>
        <p class="modal-sub">${esc(n.title)}</p>
        <div class="skeleton" aria-label="Summarising"><i></i><i></i><i></i><i></i></div>`, { label: 'Summary' });
      setTimeout(() => { if (token === Modal.token) Modal.update(this.html(n)); }, 1300);
    },
    html(n) {
      const topics = n.topics?.length ? n.topics : [T(n.title, n.description)];
      return `
        <div class="summary">
          <h2 class="modal-title">Key concepts</h2>
          <p class="modal-sub">${esc(n.title)}</p>
          <h3>What to remember</h3>
          <ul>${topics.map((t) => `<li><strong>${esc(t.name)}.</strong> ${esc(firstSentence(t.gist))}</li>`).join('')}</ul>
          <h3>Questions to expect</h3>
          <ul>${topics.slice(0, 3).map((t, i) => `<li>${esc(['Explain, with an example:', 'Derive or trace step by step:', 'Write a short note on:'][i])} ${esc(t.name)}.</li>`).join('')}</ul>
          <p class="sim-tag">This summary is simulated. It is assembled in your browser from the unit outline, not written by an AI model.</p>
        </div>`;
    },
  };

  const REVIEW_TAGS = ['Exam focused', 'Clear diagrams', 'Well structured', 'Good examples', 'Too brief', 'Needs more practice questions'];
  const STAR_WORDS = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent'];

  const Rating = {
    note: null, stars: 0, tags: new Set(),
    open(n) {
      const prev = state.reviews.find((r) => r.noteId === n.id && r.studentId === ME_STUDENT);
      this.note = n;
      this.stars = prev?.stars ?? 0;
      this.tags = new Set(prev?.tags ?? []);
      Modal.open(this.html(), { label: 'Rate this unit' });
    },
    html() {
      const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
      return `
        <h2 class="modal-title">Rate this unit</h2>
        <p class="modal-sub">${esc(this.note.title)}</p>
        <div class="stars" role="radiogroup" aria-label="Star rating">
          ${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" aria-checked="${this.stars === i}" aria-label="${i} ${i === 1 ? 'star' : 'stars'}" class="${i <= this.stars ? 'on' : ''}" data-action="star" data-stars="${i}">${star}</button>`).join('')}
        </div>
        <p class="star-label">${this.stars ? STAR_WORDS[this.stars] : 'Choose 1 to 5 stars'}</p>
        <div class="tag-row" role="group" aria-label="Quick review tags">
          ${REVIEW_TAGS.map((t) => `<button type="button" class="chip" aria-pressed="${this.tags.has(t)}" data-action="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary btn-lg" data-action="rate-submit" ${this.stars ? '' : 'disabled'}>Post rating</button>
        </div>`;
    },
    submit() {
      state.reviews = state.reviews.filter((r) => !(r.noteId === this.note.id && r.studentId === ME_STUDENT));
      state.reviews.push({ noteId: this.note.id, studentId: ME_STUDENT, stars: this.stars, tags: [...this.tags], at: Date.now() });
      Store.save();
      Modal.close();
      Catalog.render();
      Toast.show('Rating posted', 'ok');
    },
  };

  const Profile = {
    open() {
      const s = state.student;
      Modal.open(`
        <h2 class="modal-title">Your details</h2>
        <p class="modal-sub">Your email and phone are stamped on every unit you unlock.</p>
        <form data-form="profile" novalidate style="display:grid;gap:14px;margin-top:20px">
          <label class="field"><span>Full name</span><input type="text" name="name" value="${esc(s.name)}" required maxlength="60" autocomplete="name" autofocus></label>
          <label class="field"><span>Email</span><input type="email" name="email" value="${esc(s.email)}" required maxlength="80" autocomplete="email"></label>
          <label class="field"><span>Phone</span><input type="tel" name="phone" value="${esc(s.phone)}" required maxlength="16" autocomplete="tel"></label>
          <p class="form-error" role="alert" hidden></p>
          <div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg">Save details</button></div>
        </form>`, { label: 'Your details' });
    },
    submit(form) {
      const data = Object.fromEntries(new FormData(form));
      const err = $('.form-error', form);
      const name = data.name.trim(), email = data.email.trim(), phone = data.phone.trim();
      let msg = '';
      if (name.length < 2) msg = 'Enter your full name.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) msg = 'Enter a valid email address, for example aarav@example.com.';
      else if (phone.replace(/\D/g, '').length < 10) msg = 'Enter a 10-digit phone number.';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      state.student = { name, email, phone };
      Store.save();
      Modal.close();
      App.paintUser();
      Toast.show('Details saved', 'ok');
    },
  };

  /* ---------- 12. Faculty ---------- */
  const Publish = {
    busy: false,

    /** Counts page objects in the raw PDF. Falls back to a size-based estimate for PDFs that compress their object table. */
    async countPages(file) {
      try {
        const text = await file.slice(0, 12 * 1024 * 1024).text();
        const hits = text.match(/\/Type\s*\/Page(?![s\w])/g);
        if (hits?.length) return hits.length;
      } catch { /* fall through to the estimate */ }
      return clamp(Math.round(file.size / 60_000), 4, 400);
    },

    async onFile(file) {
      const zone = $('#dropzone');
      const error = $('#uploadError');
      error.hidden = true;
      if (!file) { zone.classList.remove('has-file'); $('#fileText').textContent = 'Choose a PDF or drop it here'; return; }
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf || file.size > 25 * 1024 * 1024) {
        $('#upFile').value = '';
        zone.classList.remove('has-file');
        $('#fileText').textContent = 'Choose a PDF or drop it here';
        error.textContent = isPdf ? 'That file is larger than 25 MB. Compress the PDF and choose it again.' : 'That file is not a PDF. Export your notes as PDF and choose it again.';
        error.hidden = false;
        return;
      }
      zone.classList.add('has-file');
      $('#fileText').textContent = `${file.name} (${(file.size / 1048576).toFixed(1)} MB)`;
      $('#upPages').value = await this.countPages(file);
    },

    validate(form) {
      let first = null;
      $$('.field', form).forEach((f) => f.classList.remove('invalid'));
      for (const el of $$('input, select, textarea', form)) {
        if (el.checkValidity()) continue;
        el.closest('.field')?.classList.add('invalid');
        first ??= el;
      }
      if (!first) return '';
      if (first.id !== 'upFile') first.focus();
      if (first.id === 'upFile') return 'Choose the PDF for this unit.';
      if (first.id === 'upPrice') return 'Set a price between ₹10 and ₹5,000.';
      if (first.id === 'upPages') return 'Enter the number of pages, 3 or more.';
      return 'Fill in the highlighted fields to publish.';
    },

    async submit(form) {
      if (this.busy) return;
      const error = $('#uploadError');
      const msg = this.validate(form);
      error.textContent = msg;
      error.hidden = !msg;
      if (msg) return;

      const d = Object.fromEntries(new FormData(form));
      this.busy = true;
      const btn = $('#uploadBtn'), bar = $('#uploadBar'), stage = $('#uploadStage');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Publishing';
      $('#uploadProgress').hidden = false;
      const stages = [[0, 'Uploading the PDF'], [45, 'Checking pages'], [70, 'Preparing the watermark template'], [90, 'Publishing to the marketplace']];
      for (let pct = 0; pct <= 100; pct += 4) {
        bar.style.width = `${pct}%`;
        stage.textContent = `${stages.filter(([at]) => pct >= at).pop()[1]}, ${pct}%`;
        await wait(prefersReducedMotion ? 20 : 85);
      }

      const topics = d.topics.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 12)
        .map((name) => T(name, `${name} is covered in this unit with definitions, a worked example and exam-style questions.`));
      const n = note(uid('n'), ME_FACULTY, d.subject.trim(), d.code.trim().toUpperCase(), Number(d.sem), d.branch, Number(d.unit),
        d.title.trim(), d.desc.trim(), Number(d.pages), Number(d.price), 0, 0, 0, topics);
      n.createdAt = Date.now();
      n.fileName = $('#upFile').files[0]?.name ?? '';
      state.notes.unshift(n);
      Store.save();

      this.busy = false;
      btn.disabled = false;
      btn.textContent = 'Upload and publish';
      $('#uploadProgress').hidden = true;
      bar.style.width = '0';
      form.reset();
      this.onFile(null);
      this.renderList();
      Catalog.render();
      Toast.show(`Published: ${n.title}`, 'ok');
    },

    renderList() {
      const mine = state.notes.filter((n) => n.facultyId === ME_FACULTY);
      $('#myNotesList').innerHTML = mine.map((n) => {
        const buyers = purchasesOf(n.id).length;
        return `<li data-id="${n.id}">
          <p class="mn-title">${esc(n.title)}</p>
          <p class="mn-meta">${esc(n.code)}, Unit ${n.unit}, ${inr(n.price)}, ${buyers} ${buyers === 1 ? 'student' : 'students'}</p>
          <div class="mn-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="see-analytics">View reading analytics</button>
            ${buyers === 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-action="unpublish">Unpublish</button>' : ''}
          </div>
        </li>`;
      }).join('') || '<li>You have not published a unit yet. Upload your first PDF to list it for students.</li>';
    },

    init() {
      const form = $('#uploadForm');
      form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(form); });
      $('#upFile').addEventListener('change', (e) => this.onFile(e.target.files[0]));
      const zone = $('#dropzone');
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
      zone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        try { const dt = new DataTransfer(); dt.items.add(file); $('#upFile').files = dt.files; } catch { /* older browsers: keep the picker empty */ }
        this.onFile(file);
      });
      $('#myNotesList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.closest('[data-id]').dataset.id;
        if (btn.dataset.action === 'see-analytics') { Engagement.selected = id; Faculty.showTab('engagement'); return; }
        if (!btn.dataset.armed) {
          btn.dataset.armed = '1';
          btn.textContent = 'Click again to unpublish';
          setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Unpublish'; } }, 3500);
          return;
        }
        state.notes = state.notes.filter((n) => n.id !== id);
        Store.save();
        this.renderList();
        Catalog.render();
        Toast.show('Unit unpublished');
      });
    },
  };

  const Engagement = {
    selected: null,

    render() {
      const mine = state.notes.filter((n) => n.facultyId === ME_FACULTY);
      const root = $('#engagementRoot');
      if (!mine.length) { root.innerHTML = '<div class="empty"><h2>No units yet</h2><p>Publish a unit to see how students read it.</p></div>'; return; }
      if (!mine.some((n) => n.id === this.selected)) this.selected = mine[0].id;
      const n = getNote(this.selected);
      const e = engagementFor(n.id);
      const r = ratingOf(n);
      const peakMax = Math.max(...e.hours, 1);
      const isPeak = (h) => e.hasReads && (h === e.peak || h === (e.peak + 1) % 24);

      root.innerHTML = `
        <div class="eng-layout">
          <ul class="doc-list" aria-label="Your units">
            ${mine.map((m) => {
              const me = engagementFor(m.id);
              return `<li><button type="button" class="doc-item" aria-pressed="${m.id === n.id}" data-doc="${m.id}">
                <strong>${esc(m.title)}</strong>
                <span>Unit ${m.unit}, ${me.buyers} ${me.buyers === 1 ? 'student' : 'students'}, ${fmtDur(me.totalSec)} read</span>
              </button></li>`;
            }).join('')}
          </ul>

          <div class="glass">
            <div class="eng-head">
              <div>
                <h2>${esc(n.title)}</h2>
                <p>${esc(n.subject)} (${esc(n.code)}), Unit ${n.unit}, ${n.pages} pages${r.count ? `, rated ${r.avg.toFixed(1)} by ${r.count}` : ''}</p>
              </div>
              <span class="badge badge-ok" style="animation:none"><span class="session-dot"></span>Updates as students read</span>
            </div>

            <div class="stat-row">
              <div class="stat tilt"><p class="stat-label">Unique students purchased</p><p class="stat-value">${e.buyers}</p><p class="stat-note">${e.sessions} reading ${e.sessions === 1 ? 'session' : 'sessions'}</p></div>
              <div class="stat tilt"><p class="stat-label">Total time spent reading</p><p class="stat-value">${fmtDur(e.totalSec)}</p><p class="stat-note">Active time only</p></div>
              <div class="stat tilt"><p class="stat-label">Average per student</p><p class="stat-value">${fmtDur(e.avgSec)}</p><p class="stat-note">Across all buyers</p></div>
              <div class="stat tilt"><p class="stat-label">Completion drop-off</p><p class="stat-value">${Math.round(e.dropoff * 100)}%</p><p class="stat-note">Bought but did not finish</p></div>
            </div>

            <div class="eng-two">
              <div class="sub-card">
                <h3>Most active reading hours</h3>
                <p>${e.hasReads ? `Busiest between ${fmtHour(e.peak)} and ${fmtHour((e.peak + 2) % 24)}.` : 'No reading recorded yet.'}</p>
                <div class="hours" role="img" aria-label="${e.hasReads ? `Reading time by hour of day. Busiest between ${fmtHour(e.peak)} and ${fmtHour((e.peak + 2) % 24)}.` : 'No reading recorded yet'}">
                  ${e.hours.map((v, h) => `<i class="${isPeak(h) ? 'peak' : ''}" style="height:${Math.max(3, (v / peakMax) * 100)}%" title="${fmtHour(h)}: ${fmtDur(v)}"></i>`).join('')}
                </div>
                <div class="hours-axis" aria-hidden="true"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span></div>
              </div>
              <div class="sub-card">
                <h3>Where students stop</h3>
                <p>Students who got at least this far.</p>
                <ol class="funnel">
                  ${e.funnel.map(([label, count]) => `<li><span>${label}</span><span class="track"><span class="fill" style="width:${e.buyers ? (count / e.buyers) * 100 : 0}%"></span></span><b>${count}</b></li>`).join('')}
                </ol>
              </div>
            </div>

            <h3 class="section-title">Student-wise reading</h3>
            ${e.students.length ? `
            <div class="table-wrap"><table>
              <thead><tr><th scope="col">Student</th><th scope="col" class="num">Sessions</th><th scope="col">Furthest point</th><th scope="col">Last read</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead>
              <tbody>
                ${e.students.map((s) => `<tr>
                  <td><strong>${esc(shortName(s.name))}</strong> ${s.sec ? `${fmtDur(s.sec)} reading Unit ${n.unit}` : 'has not opened it yet'}</td>
                  <td class="num">${s.sessions.length}</td>
                  <td><span class="mini"><i style="width:${s.progress}%"></i></span>${s.progress}%</td>
                  <td>${s.last ? fmtDate(s.last) : 'Not yet'}</td>
                  <td class="num"><button type="button" class="btn btn-ghost btn-sm" data-inspect="${s.id}" aria-label="View sessions for ${esc(shortName(s.name))}">View sessions</button></td>
                </tr>`).join('')}
              </tbody>
            </table></div>` : '<p>No student has unlocked this unit yet. Sales and reading time appear here as they happen.</p>'}
          </div>
        </div>`;
      attachTilt(root);
    },

    inspect(studentId) {
      const n = getNote(this.selected);
      const s = engagementFor(n.id).students.find((x) => x.id === studentId);
      if (!s) return;
      const purchase = purchasesOf(n.id).find((p) => p.studentId === studentId);
      Modal.open(`
        <h2 class="modal-title">${esc(shortName(s.name))}</h2>
        <p class="modal-sub">${esc(n.title)}, Unit ${n.unit}</p>
        <dl class="receipt">
          <div><dt>Unlocked on</dt><dd>${fmtDate(purchase.at)} for ${inr(purchase.amount)}</dd></div>
          <div><dt>Total active reading</dt><dd>${fmtDur(s.sec)}</dd></div>
          <div><dt>Sessions</dt><dd>${s.sessions.length}</dd></div>
          <div><dt>Furthest point</dt><dd>${s.progress}%</dd></div>
        </dl>
        <h3 class="section-title">Reading sessions</h3>
        ${s.sessions.length ? `<ul class="session-list">
          ${s.sessions.map((x) => `<li>
            <strong>${fmtDate(x.startedAt)}</strong><strong class="right">${fmtDur(x.activeSec)} active</strong>
            <span>${fmtTime(x.startedAt)} to ${fmtTime(x.endedAt)}</span><span class="right">Reached ${x.progress}%</span>
          </li>`).join('')}
        </ul>` : '<p>This student has unlocked the unit but has not opened it yet.</p>'}`, { label: `Reading sessions for ${shortName(s.name)}` });
    },

    init() {
      $('#engagementRoot').addEventListener('click', (e) => {
        const doc = e.target.closest('[data-doc]');
        if (doc) { this.selected = doc.dataset.doc; this.render(); return; }
        const who = e.target.closest('[data-inspect]');
        if (who) this.inspect(who.dataset.inspect);
      });
    },
  };

  const Earnings = {
    paying: false,

    render() {
      const e = earnings();
      const fac = state.faculty[ME_FACULTY];
      const perDoc = e.mine.map((n) => {
        const sales = purchasesOf(n.id);
        const gross = sum(sales, (p) => p.amount);
        return { n, units: sales.length, gross, net: gross - Math.round(gross * COMMISSION_RATE) };
      }).sort((a, b) => b.gross - a.gross);

      $('#earningsRoot').innerHTML = `
        <div class="stat-row">
          <div class="stat tilt"><p class="stat-label">Total gross revenue</p><p class="stat-value">${inr(e.gross)}</p><p class="stat-note">${e.sales.length} ${e.sales.length === 1 ? 'sale' : 'sales'}</p></div>
          <div class="stat tilt"><p class="stat-label">Platform commission</p><p class="stat-value">${inr(e.commission)}</p><p class="stat-note">${Math.round(COMMISSION_RATE * 100)}% of each sale</p></div>
          <div class="stat tilt"><p class="stat-label">Net earnings</p><p class="stat-value">${inr(e.net)}</p><p class="stat-note">${inr(e.paid)} already paid out</p></div>
          <div class="stat tilt stat-ok"><p class="stat-label">Available to withdraw</p><p class="stat-value">${inr(e.available)}</p><p class="stat-note">Ready now</p></div>
        </div>

        <div class="glass payout">
          <p>${e.available > 0
            ? `<strong>${inr(e.available)}</strong> will be sent to your ${esc(fac.bank)}. Instant payouts usually arrive within a few minutes.`
            : 'Nothing to withdraw right now. New sales appear here as soon as a student pays.'}</p>
          <button type="button" class="btn btn-success btn-lg" id="payoutBtn" ${e.available > 0 ? '' : 'disabled'}>Request instant payout</button>
        </div>

        <div class="earn-two">
          <div>
            <h3 class="section-title" style="margin-top:0">Earnings by unit</h3>
            <div class="table-wrap"><table>
              <thead><tr><th scope="col">Unit</th><th scope="col" class="num">Price</th><th scope="col" class="num">Sold</th><th scope="col" class="num">Gross</th><th scope="col" class="num">Net</th></tr></thead>
              <tbody>${perDoc.map((d) => `<tr>
                <td><strong>${esc(d.n.title)}</strong><br>${esc(d.n.code)}, Unit ${d.n.unit}</td>
                <td class="num">${inr(d.n.price)}</td><td class="num">${d.units}</td><td class="num">${inr(d.gross)}</td><td class="num"><strong>${inr(d.net)}</strong></td>
              </tr>`).join('') || '<tr><td colspan="5">Publish a unit to start earning.</td></tr>'}</tbody>
            </table></div>

            <h3 class="section-title">Recent sales</h3>
            <div class="table-wrap"><table>
              <thead><tr><th scope="col">Student</th><th scope="col">Unit</th><th scope="col">Date</th><th scope="col">Method</th><th scope="col" class="num">Amount</th></tr></thead>
              <tbody>${e.sales.slice(0, 8).map((p) => {
                const n = getNote(p.noteId);
                return `<tr><td><strong>${esc(shortName(studentName(p.studentId)))}</strong></td><td>${esc(n.code)} Unit ${n.unit}</td><td>${fmtDate(p.at)}</td><td>${esc(p.method.replace(/\s*\(.*\)$/, ''))}</td><td class="num">${inr(p.amount)}</td></tr>`;
              }).join('') || '<tr><td colspan="5">No sales yet.</td></tr>'}</tbody>
            </table></div>
          </div>

          <div>
            <h3 class="section-title" style="margin-top:0">Payout history</h3>
            <ul class="payout-list">
              ${[...state.payouts].sort((a, b) => b.at - a.at).map((p) => `<li>
                <span><strong>${inr(p.amount)}</strong>${fmtDate(p.at)}, ${esc(p.ref)}</span>
                <span class="badge badge-ok" style="animation:none">Paid</span>
              </li>`).join('') || '<li>No payouts yet.</li>'}
            </ul>
          </div>
        </div>`;
      attachTilt($('#earningsRoot'));
    },

    async requestPayout(btn) {
      const { available } = earnings();
      if (this.paying || available <= 0) return;
      this.paying = true;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="border-top-color:#04130D;border-color:rgba(4,19,13,.3) rgba(4,19,13,.3) rgba(4,19,13,.3) #04130D"></span> Requesting payout';
      await wait(1800);
      state.payouts.push({ id: uid('po'), amount: available, at: Date.now(), ref: 'PO-' + String(Date.now()).slice(-5), to: state.faculty[ME_FACULTY].bank });
      Store.save();
      this.paying = false;
      this.render();
      Toast.show(`Payout requested: ${inr(available)} is on its way to your bank`, 'ok');
    },

    init() {
      $('#earningsRoot').addEventListener('click', (e) => {
        const btn = e.target.closest('#payoutBtn');
        if (btn) this.requestPayout(btn);
      });
    },
  };

  const Faculty = {
    tab: 'publish',
    showTab(name) {
      this.tab = name;
      $$('#facultyTabs [role="tab"]').forEach((t) => {
        const on = t.id === `tab-${name}`;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
      });
      this.render();
    },
    render() {
      const fac = state.faculty[ME_FACULTY];
      $('#facultyLine').textContent = `${fac.name}, ${fac.college} (${fac.uni})`;
      if (this.tab === 'publish') Publish.renderList();
      if (this.tab === 'engagement') Engagement.render();
      if (this.tab === 'earnings') Earnings.render();
    },
    init() {
      const tabs = $$('#facultyTabs [role="tab"]');
      $('#facultyTabs').addEventListener('click', (e) => {
        const t = e.target.closest('[role="tab"]');
        if (t) this.showTab(t.id.replace('tab-', ''));
      });
      $('#facultyTabs').addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const i = tabs.indexOf(document.activeElement);
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        next.focus();
        this.showTab(next.id.replace('tab-', ''));
      });
      Publish.init();
      Engagement.init();
      Earnings.init();
    },
  };

  /* ---------- 13. App ---------- */
  const App = {
    setRole(role) {
      state.role = role;
      Store.save();
      $('#roleSwitch').dataset.role = role;
      $$('#roleSwitch [role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.role === role)));
      $('#studentView').hidden = role !== 'student';
      $('#facultyView').hidden = role !== 'faculty';
      this.paintUser();
      role === 'student' ? Catalog.render() : Faculty.render();
    },

    paintUser() {
      const isStudent = state.role === 'student';
      const name = isStudent ? state.student.name : state.faculty[ME_FACULTY].name;
      $('#userName').textContent = name;
      $('#userAvatar').textContent = initials(name);
      $('#userRole').textContent = isStudent ? 'Signed in as student' : 'Signed in as faculty';
      const chip = $('#userChip');
      chip.disabled = !isStudent;
      chip.setAttribute('aria-label', isStudent ? `Edit your details, ${name}` : `${name}, faculty`);
    },

    /** Handlers for buttons and forms rendered inside the shared modal. */
    wireModal() {
      Modal.el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const n = btn.dataset.id ? getNote(btn.dataset.id) : null;
        ({
          close: () => Modal.close(),
          buy: () => Checkout.open(n),
          read: () => Reader.open(n),
          download: () => { downloadNotes(n); Toast.show('Download started', 'ok'); },
          invoice: () => { downloadInvoice(n); Toast.show('Invoice downloaded', 'ok'); },
          'pay-method': () => { Checkout.captureInputs(); Checkout.method = btn.dataset.method; Checkout.error = ''; Checkout.renderForm(); },
          'pay-retry': () => { Checkout.error = ''; Checkout.renderForm(); },
          'upi-fill': () => {
            const input = $('#upiId', Modal.body);
            const user = (input.value.split('@')[0] || state.student.email.split('@')[0]).replace(/[^a-zA-Z0-9._-]/g, '');
            input.value = `${user}@${btn.dataset.handle}`;
            input.focus();
          },
          star: () => { Rating.stars = Number(btn.dataset.stars); Modal.update(Rating.html()); $(`[data-stars="${Rating.stars}"]`, Modal.body).focus(); },
          tag: () => {
            const t = btn.dataset.tag;
            Rating.tags.has(t) ? Rating.tags.delete(t) : Rating.tags.add(t);
            btn.setAttribute('aria-pressed', String(Rating.tags.has(t)));
          },
          'rate-submit': () => Rating.submit(),
        })[btn.dataset.action]?.();
      });
      Modal.el.addEventListener('submit', (e) => {
        const form = e.target.closest('[data-form]');
        if (!form) return;
        e.preventDefault();
        if (form.dataset.form === 'pay') Checkout.submit();
        if (form.dataset.form === 'profile') Profile.submit(form);
      });
    },

    init() {
      Store.load();
      Modal.init();
      this.wireModal();
      Catalog.init();
      Reader.init();
      Faculty.init();

      $('#roleSwitch').addEventListener('click', (e) => {
        const b = e.target.closest('[data-role]');
        if (b) this.setRole(b.dataset.role);
      });
      $('#roleSwitch').addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const next = state.role === 'student' ? 'faculty' : 'student';
        this.setRole(next);
        $(`#roleSwitch [data-role="${next}"]`).focus();
      });
      $('#userChip').addEventListener('click', () => { if (state.role === 'student') Profile.open(); });
      $('#resetDemo').addEventListener('click', () => {
        Store.reset();
        Engagement.selected = null;
        this.setRole('student');
        Toast.show('Demo data reset');
      });

      // Another tab changed the data (for example a student reading while the dashboard is open): refresh this one.
      window.addEventListener('storage', (e) => {
        if (e.key !== STORE_KEY || !e.newValue || Reader.session) return;
        try { const next = JSON.parse(e.newValue); next.role = state.role; state = next; } catch { return; }
        state.role === 'student' ? Catalog.render() : Faculty.render();
      });

      this.setRole(state.role === 'faculty' ? 'faculty' : 'student');
    },
  };

  App.init();
})();
