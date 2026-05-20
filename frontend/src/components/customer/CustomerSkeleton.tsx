import type { CSSProperties } from 'react';

type CustomerSkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

export function CustomerSkeleton({ className = '', style }: CustomerSkeletonProps) {
  return <div className={`customer-skeleton ${className}`} style={style} aria-hidden="true" />;
}

function SkeletonStatGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <CustomerSkeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <CustomerSkeleton className="h-3 w-16" />
              <CustomerSkeleton className="h-6 w-20" />
            </div>
          </div>
          <CustomerSkeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function SkeletonHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <CustomerSkeleton className="h-3 w-24" />
        <CustomerSkeleton className="h-8 w-52" />
        <CustomerSkeleton className="h-4 w-72 max-w-full" />
      </div>
      {action && <CustomerSkeleton className="h-10 w-32" />}
    </div>
  );
}

function SkeletonTabs({ count = 4 }: { count?: number }) {
  return (
    <div className="flex w-fit flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      {Array.from({ length: count }).map((_, index) => (
        <CustomerSkeleton key={index} className="h-8 w-20" />
      ))}
    </div>
  );
}

function SkeletonBookingRows({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex">
            <CustomerSkeleton className="w-1 shrink-0 rounded-none" />
            <div className="flex-1 space-y-4 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-2">
                  <CustomerSkeleton className="h-3 w-24" />
                  <CustomerSkeleton className="h-5 w-56 max-w-full" />
                  <CustomerSkeleton className="h-3 w-40 max-w-full" />
                </div>
                <div className="space-y-2 sm:w-36">
                  <CustomerSkeleton className="h-5 w-full" />
                  <CustomerSkeleton className="h-3 w-28" />
                </div>
              </div>
              <CustomerSkeleton className="h-px w-full rounded-none" />
              <div className="flex items-center justify-between gap-4">
                <CustomerSkeleton className="h-3 w-32" />
                <CustomerSkeleton className="h-9 w-32" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CustomerBookingsSkeleton() {
  return (
    <div className="customer-content-fade-in space-y-6 pb-10" aria-busy="true">
      <SkeletonHeader action />
      <SkeletonStatGrid />
      <SkeletonTabs count={5} />
      <SkeletonBookingRows count={2} />
    </div>
  );
}

function SkeletonGarageCard() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <CustomerSkeleton className="h-36 w-full rounded-none" />
      <div className="space-y-3 p-4">
        <CustomerSkeleton className="h-5 w-40" />
        <CustomerSkeleton className="h-3 w-24" />
        <CustomerSkeleton className="h-px w-full rounded-none" />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <CustomerSkeleton className="h-[52px]" />
          <CustomerSkeleton className="h-[52px]" />
        </div>
      </div>
    </div>
  );
}

function SkeletonPanel({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <CustomerSkeleton className="h-3 w-24" />
          <CustomerSkeleton className="h-6 w-40 max-w-full" />
        </div>
        <CustomerSkeleton className="h-11 w-11 rounded-2xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <CustomerSkeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function CustomerDashboardHomeSkeleton() {
  return (
    <div className="customer-content-fade-in space-y-8 pb-8" aria-busy="true">
      <SkeletonStatGrid />
      <section className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-2">
            <CustomerSkeleton className="h-3 w-24" />
            <CustomerSkeleton className="h-6 w-36" />
          </div>
          <CustomerSkeleton className="h-9 w-28 rounded-full" />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonGarageCard key={index} />
            ))}
          </div>
          <aside className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <SkeletonPanel rows={2} />
            <SkeletonPanel rows={3} />
          </aside>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonPanel rows={4} />
        <SkeletonPanel rows={4} />
      </div>
    </div>
  );
}

export function CustomerDocumentsSkeleton() {
  return (
    <div className="customer-content-fade-in space-y-6 pb-10" aria-busy="true">
      <SkeletonHeader action />
      <SkeletonTabs count={3} />
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex items-start gap-4 border-b border-slate-100 p-4 last:border-b-0">
            <CustomerSkeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <CustomerSkeleton className="h-5 w-64 max-w-full" />
              <CustomerSkeleton className="h-4 w-80 max-w-full" />
              <CustomerSkeleton className="h-3 w-32" />
            </div>
            <CustomerSkeleton className="hidden h-8 w-24 sm:block" />
          </div>
        ))}
      </div>
      <CustomerSkeleton className="h-16 w-full" />
    </div>
  );
}

export function CustomerPaymentsSkeleton() {
  return (
    <div className="customer-content-fade-in space-y-6 pb-10" aria-busy="true">
      <SkeletonHeader />
      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <CustomerSkeleton className="mb-4 h-3 w-36" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <CustomerSkeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      </div>
      <SkeletonStatGrid />
      <SkeletonTabs count={3} />
      <SkeletonBookingRows count={1} />
    </div>
  );
}

export function CustomerRewardsSkeleton() {
  return (
    <div className="customer-content-fade-in space-y-6 pb-10" aria-busy="true">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <CustomerSkeleton className="h-3 w-20" />
            <CustomerSkeleton className="h-8 w-52" />
            <CustomerSkeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex gap-3">
            <CustomerSkeleton className="h-10 w-28 rounded-full" />
            <CustomerSkeleton className="h-10 w-24 rounded-full" />
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <CustomerSkeleton className="h-4 w-36" />
              <CustomerSkeleton className="h-3 w-44" />
            </div>
            <CustomerSkeleton className="h-8 w-20" />
          </div>
          <CustomerSkeleton className="h-3 w-full rounded-full" />
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonPanel key={index} rows={2} />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonPanel key={index} rows={3} />
        ))}
      </div>
    </div>
  );
}

export function CustomerServicesSkeleton() {
  return (
    <div className="customer-content-fade-in space-y-8 pb-10" aria-busy="true">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <header className="flex flex-col gap-6 border-b border-slate-100 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl flex-1 space-y-3">
            <CustomerSkeleton className="h-3 w-32" />
            <CustomerSkeleton className="h-8 w-80 max-w-full" />
            <CustomerSkeleton className="h-4 w-[520px] max-w-full" />
          </div>
          <div className="w-full space-y-2 sm:max-w-xs lg:w-64">
            <CustomerSkeleton className="h-3 w-28" />
            <CustomerSkeleton className="h-12 w-full" />
          </div>
        </header>
	        <div className="grid w-full grid-cols-1 gap-5 pt-6 lg:grid-cols-3">
	          {Array.from({ length: 3 }).map((_, index) => (
	            <div key={index} className="flex min-h-[520px] flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
	              <CustomerSkeleton className="h-6 w-28 rounded-full" />
              <CustomerSkeleton className="mt-5 h-10 w-32" />
              <CustomerSkeleton className="mt-3 h-4 w-full" />
              <CustomerSkeleton className="mt-8 h-9 w-44" />
              <CustomerSkeleton className="my-6 h-px w-full rounded-none" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="flex gap-3">
                    <CustomerSkeleton className="h-5 w-5 rounded-full" />
                    <CustomerSkeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
	              <CustomerSkeleton className="mt-auto h-12 w-full" />
	            </div>
	          ))}
	          <div className="flex min-h-[520px] flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3 lg:grid lg:min-h-[360px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8 lg:p-8">
	            <div className="flex flex-col justify-between">
	              <div>
	                <CustomerSkeleton className="h-6 w-32 rounded-full" />
	                <CustomerSkeleton className="mt-5 h-12 w-40" />
	                <CustomerSkeleton className="mt-3 h-4 w-full max-w-xl" />
	                <CustomerSkeleton className="mt-8 h-10 w-56" />
	              </div>
	              <CustomerSkeleton className="mt-6 h-16 w-full max-w-xl" />
	            </div>
	            <div className="mt-6 flex flex-col border-t border-slate-200/80 pt-6 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
	              <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:gap-x-5">
	                {Array.from({ length: 6 }).map((__, rowIndex) => (
	                  <div key={rowIndex} className="flex gap-3">
	                    <CustomerSkeleton className="h-5 w-5 rounded-full" />
	                    <CustomerSkeleton className="h-4 flex-1" />
	                  </div>
	                ))}
	              </div>
	              <CustomerSkeleton className="mt-6 h-12 w-full lg:mt-8" />
	            </div>
	          </div>
	        </div>
	      </section>
	    </div>
	  );
	}
