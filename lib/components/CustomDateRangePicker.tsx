'use client';

import * as React from 'react';
import { format, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DateRange, DayPicker } from 'react-day-picker';

interface CustomDateRangePickerProps {
    value: DateRange | undefined;
    onChange: (range: DateRange | undefined) => void;
    className?: string;
}

export function CustomDateRangePicker({ value, onChange, className }: CustomDateRangePickerProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Close when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(undefined);
    };

    return (
        <div className={cn('relative', className)} ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-10 pl-4 pr-10 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl focus:ring-2 focus:ring-[#00a8a8] text-sm md:text-base outline-none transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 flex items-center justify-between group border-0 shadow-sm"
            >
                <div className="flex items-center gap-2 truncate">
                    <CalendarIcon className="size-4 text-slate-400 group-hover:text-[#00a8a8] transition-colors" />
                    <span className={cn('truncate', !value?.from && 'text-slate-400')}>
                        {value?.from ? (
                            value.to ? (
                                <>
                                    {format(value.from, 'dd/MM/yyyy')} -{' '}
                                    {format(value.to, 'dd/MM/yyyy')}
                                </>
                            ) : (
                                format(value.from, 'dd/MM/yyyy')
                            )
                        ) : (
                            'Select date range'
                        )}
                    </span>
                </div>
                {value?.from && (
                    <div
                        onClick={handleClear}
                        className="absolute right-3 p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer"
                    >
                        <X className="size-4 text-slate-400" />
                    </div>
                )}
                {!value?.from && (
                    <ChevronRight
                        className={cn(
                            'size-4 text-slate-400 transition-transform',
                            isOpen && 'rotate-90',
                        )}
                    />
                )}
            </button>

            {isOpen && (
                <div className="absolute top-12 left-0 z-50 bg-white dark:bg-[#1e2936] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 animate-in fade-in zoom-in-95 duration-200 origin-top overflow-hidden">
                    <DayPicker
                        mode="range"
                        selected={value}
                        onSelect={onChange}
                        showOutsideDays
                        className="p-0"
                        classNames={{
                            months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                            month: 'space-y-4',
                            month_caption: 'flex justify-between pt-1 relative items-center px-4 mb-2',
                            caption_label: 'text-sm font-bold text-slate-900 dark:text-slate-100',
                            nav: 'm-0 flex items-center',
                            button_previous: 'absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity border-0 cursor-pointer text-slate-900 dark:text-slate-100 flex items-center justify-center',
                            button_next: 'absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity border-0 cursor-pointer text-slate-900 dark:text-slate-100 flex items-center justify-center',
                            month_grid: 'w-full border-collapse space-y-1',
                            weekdays: 'flex px-2',
                            weekday: 'text-slate-400 rounded-md w-9 font-normal text-[0.8rem] uppercase flex items-center justify-center',
                            week: 'flex w-full mt-2 px-2',
                            day: 'h-9 w-9 p-0 flex items-center justify-center relative',
                            day_button: 'h-9 w-9 p-0 font-normal hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors border-0 cursor-pointer text-slate-900 dark:text-slate-100 bg-transparent flex items-center justify-center outline-none z-10',
                            range_start: 'bg-[#00a8a8]/15 dark:bg-[#00a8a8]/25 rounded-l-full z-20 [&>button]:bg-[#00a8a8] [&>button]:!text-white [&>button]:rounded-full [&>button]:shadow-lg [&>button]:shadow-[#00a8a8]/40',
                            range_end: 'bg-[#00a8a8]/15 dark:bg-[#00a8a8]/25 rounded-r-full z-20 [&>button]:bg-[#00a8a8] [&>button]:!text-white [&>button]:rounded-full [&>button]:shadow-lg [&>button]:shadow-[#00a8a8]/40',
                            range_middle: 'bg-[#00a8a8]/10 dark:bg-[#00a8a8]/20 !rounded-none z-20 hover:bg-[#00a8a8]/30 transition-colors',
                            selected: '',
                            today: 'text-[#00a8a8] font-bold underline decoration-2 underline-offset-4',
                            outside: 'text-slate-300 dark:text-slate-600 opacity-50',
                            disabled: 'text-slate-300 dark:text-slate-600 opacity-50 cursor-not-allowed',
                            hidden: 'invisible',
                        }}
                        components={{
                            Chevron: (props) => {
                                if (props.orientation === 'left') return <ChevronLeft className="h-4 w-4" />;
                                return <ChevronRight className="h-4 w-4" />;
                            }
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// Simple cn utility if not present
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
