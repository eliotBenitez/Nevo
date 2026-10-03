// Shared chrome for the three phone workspace views. Keep utility names static
// so Tailwind emits them without coupling the views to a global CSS selector.
export const mobileWorkspaceViewClass = 'tw:relative tw:z-1 tw:w-full tw:min-w-0 tw:min-h-0 tw:flex-[1_1_auto] tw:overflow-x-hidden tw:overflow-y-auto tw:overscroll-contain tw:pt-[calc(22px+max(var(--safe-area-top),0px))] tw:pr-[calc(18px+max(var(--safe-area-right),0px))] tw:pb-[calc(108px+max(var(--safe-area-bottom),0px))] tw:pl-[calc(18px+max(var(--safe-area-left),0px))] tw:text-content-primary'

export const mobileViewHeaderClass = 'tw:mb-5 tw:flex tw:min-h-[78px] tw:items-center tw:justify-between tw:gap-[18px]'

export const mobileViewEyebrowClass = 'tw:mt-0 tw:mb-[5px] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:font-[720] tw:tracking-[0.13em] tw:uppercase tw:text-content-muted'

export const mobileViewTitleClass = 'tw:m-0 tw:text-[clamp(30px,9.5vw,38px)] tw:leading-none tw:font-[650] tw:tracking-[-0.045em]'

export const mobileIconButtonClass = 'tw:relative tw:grid tw:size-12 tw:flex-[0_0_48px] tw:place-items-center tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border tw:border-transparent tw:p-0 tw:text-content-secondary tw:active:scale-[0.97] tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent'

export const mobileIconButtonDefaultClass = 'tw:bg-surface-subtle'
export const mobileIconButtonStrongClass = 'tw:bg-(--surface-raised) tw:shadow-(--shadow-raised)'

export const mobileLibraryTabClass = 'tw:relative tw:flex tw:min-h-12 tw:min-w-11 tw:items-center tw:gap-1.5 tw:border-0 tw:bg-transparent tw:px-0 tw:pt-2 tw:pb-2.5 tw:[font-family:inherit] tw:text-[13px] tw:font-[620] tw:text-content-muted tw:aria-selected:text-content-primary'

export const mobileLibraryTabBadgeClass = 'tw:inline-grid tw:h-5 tw:min-w-5 tw:place-items-center tw:rounded-full tw:px-1.5 tw:text-[10px] tw:shadow-(--shadow-raised)'

export const mobileEmptyStateClass = 'tw:flex tw:min-h-[118px] tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:p-6 tw:text-center tw:text-content-muted'
export const mobileEmptyPanelClass = 'tw:mt-8 tw:min-h-[260px] tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle'
export const mobileEmptyMarkClass = 'tw:grid tw:size-12 tw:place-items-center tw:rounded-[calc(15px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-accent'
