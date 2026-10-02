// Komponen shadcn/ui (new-york-v4) untuk template EJS.
// Class dan varian disalin dari https://github.com/shadcn-ui/ui (apps/v4/registry/new-york-v4/ui)
// dan dirangkai dengan cva + tailwind-merge seperti fungsi cn() milik shadcn.
// Perubahan dari sumber asli ditandai "app:".
const fs = require('fs');
const path = require('path');
const { cva } = require('class-variance-authority');
const { clsx } = require('clsx');
const { twMerge } = require('tailwind-merge');

const cn = (...inputs) => twMerge(clsx(inputs));

// app: tinggi minimal 44px untuk target sentuh di layar sentuh/sempit (lihat DESIGN.md)
const TOUCH = 'pointer-coarse:min-h-11 max-lg:min-h-11';

const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${TOUCH}`,
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        // app: varian untuk satu-satunya aksen "perlu tindakan"
        highlight: 'bg-highlight text-highlight-foreground hover:bg-highlight/85',
        // app: tombol hapus berbingkai (aksi berbahaya yang tidak utama)
        'outline-destructive': 'border border-destructive/40 bg-background text-destructive shadow-xs hover:bg-destructive/10',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: 'h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*=\'size-\'])]:size-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive: 'bg-destructive text-white [a&]:hover:bg-destructive/90',
        outline: 'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        // app: skala status semantik (latar muda, teks gelap, kontras minimal 6:1)
        hadir: 'bg-status-hadir text-status-hadir-foreground',
        terlambat: 'bg-status-telat text-status-telat-foreground',
        alpa: 'bg-status-alpa text-status-alpa-foreground',
        dinas: 'bg-status-dinas text-status-dinas-foreground',
        netral: 'bg-status-izin text-status-izin-foreground',
        highlight: 'bg-highlight text-highlight-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const STATUS_BADGE = {
  hadir: 'hadir', terlambat: 'terlambat', alpa: 'alpa', dinas_luar: 'dinas', izin: 'netral', sakit: 'netral', cuti: 'netral',
  menunggu: 'terlambat', disetujui: 'hadir', ditolak: 'alpa',
};

// app: tab tidak aktif memakai muted-foreground (foreground/60 di atas muted hanya 3,9:1)
const tabsTrigger = (active) => cn(
  'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0',
  active && 'bg-background text-foreground shadow-sm',
  TOUCH,
);

const ui = {
  cn,
  button: (opts = {}, extra) => cn(buttonVariants(opts), extra),
  badge: (opts = {}, extra) => cn(badgeVariants(opts), extra),
  statusBadge: (status, extra) => cn(badgeVariants({ variant: STATUS_BADGE[status] || 'netral' }), extra),

  card: (extra) => cn('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', extra),
  cardHeader: (extra) => cn('@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6', extra),
  cardTitle: (extra) => cn('leading-none font-semibold', extra),
  cardDescription: (extra) => cn('text-sm text-muted-foreground', extra),
  cardAction: (extra) => cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', extra),
  cardContent: (extra) => cn('px-6', extra),
  cardFooter: (extra) => cn('flex items-center px-6 [.border-t]:pt-6', extra),

  input: (extra) => cn(
    'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
    'bg-card', TOUCH, extra,
  ),
  textarea: (extra) => cn('flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30', extra),
  // NativeSelect: pembungkus + select + ikon chevron
  selectWrap: (extra) => cn('group/native-select relative w-full has-[select:disabled]:opacity-50', extra),
  select: (extra) => cn(
    'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-card px-3 py-2 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1 dark:bg-input/30 dark:hover:bg-input/50',
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    TOUCH, extra,
  ),
  selectIcon: 'pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none',
  label: (extra) => cn('flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50', extra),
  checkbox: (extra) => cn('peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 accent-primary pointer-coarse:size-5', extra),
  // Switch: checkbox asli bergaya switch shadcn (lihat .ui-switch di CSS)
  switch: (extra) => cn('ui-switch peer inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer appearance-none items-center rounded-full border border-transparent bg-input shadow-xs transition-all outline-none checked:bg-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50', extra),
  separator: (extra) => cn('shrink-0 bg-border h-px w-full', extra),
  progress: (extra) => cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', extra),
  progressBar: 'h-full w-full flex-1 bg-primary transition-all',

  alert: (variant = 'default', extra) => cn(
    'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
    {
      default: 'bg-card text-card-foreground',
      destructive: 'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current',
      // app: varian peringatan dan berhasil memakai skala status
      warning: 'border-status-telat-foreground/25 bg-status-telat text-status-telat-foreground *:data-[slot=alert-description]:text-status-telat-foreground',
      success: 'border-status-hadir-foreground/25 bg-status-hadir text-status-hadir-foreground *:data-[slot=alert-description]:text-status-hadir-foreground',
    }[variant],
    extra,
  ),
  alertTitle: (extra) => cn('col-start-2 min-h-4 font-medium tracking-tight', extra),
  alertDescription: (extra) => cn('col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed', extra),

  table: (extra) => cn('w-full caption-bottom text-sm', extra),
  tableContainer: 'relative w-full overflow-x-auto',
  tableHeader: '[&_tr]:border-b',
  tableBody: '[&_tr:last-child]:border-0',
  tableRow: (extra) => cn('border-b transition-colors hover:bg-muted/50', extra),
  tableHead: (extra) => cn('h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0', extra),
  // app: sel boleh membungkus teks (data absensi berisi keterangan panjang)
  tableCell: (extra) => cn('p-2 align-middle [&:has([role=checkbox])]:pr-0', extra),

  tabsList: (extra) => cn('inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground h-9 pointer-coarse:h-12 max-lg:h-12', extra),
  tabsTrigger,

  dialog: (extra) => cn('ui-dialog fixed top-[50%] left-[50%] z-50 m-0 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 text-foreground shadow-lg outline-none sm:max-w-lg', extra),
  dialogHeader: 'flex flex-col gap-2 text-center sm:text-left',
  dialogFooter: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
  dialogTitle: 'text-lg leading-none font-semibold',
  dialogDescription: 'text-sm text-muted-foreground',
  dialogClose: 'absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden [&_svg]:size-4 inline-flex items-center justify-center size-8 pointer-coarse:size-11',

  sheet: (side = 'right', extra) => cn('ui-dialog fixed z-50 m-0 flex h-full max-h-none flex-col gap-4 bg-background text-foreground shadow-lg', {
    right: 'inset-y-0 right-0 left-auto h-full w-3/4 border-l sm:max-w-sm',
    left: 'inset-y-0 left-0 right-auto h-full w-3/4 border-r sm:max-w-sm',
  }[side], extra),

  dropdownContent: (extra) => cn('ui-dropdown z-50 hidden min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:block', extra),
  dropdownItem: (variant, extra) => cn(
    'relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 [&_svg:not([class*=\'text-\'])]:text-muted-foreground',
    variant === 'destructive' && 'text-destructive focus:bg-destructive/10 focus:text-destructive hover:bg-destructive/10 hover:text-destructive',
    'pointer-coarse:py-3 max-lg:py-3', extra,
  ),
  dropdownLabel: 'px-2 py-1.5 text-sm font-medium',
  dropdownSeparator: 'bg-border -mx-1 my-1 h-px',
};

// Ikon lucide (ikon bawaan shadcn), disisipkan sebagai SVG inline.
const ICON_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const iconCache = new Map();
ui.icon = (name, extra = '') => {
  if (!iconCache.has(name)) {
    const svg = fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    iconCache.set(name, svg);
  }
  return iconCache.get(name)
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')
    .replace(/class="([^"]*)"/, (m, c) => `class="${c}${extra ? ` ${extra}` : ''}"`);
};

module.exports = ui;
