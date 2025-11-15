"use client"
import React from 'react'

export default function SlapAnimation({ playing }: { playing: boolean }) {
  return (
    <div className={"slap-animation " + (playing ? 'play' : '')} aria-hidden>
      <div className="person">
        <div className="head"></div>
      </div>

      <svg className="hand" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* simple cartoon hand */}
        <path d="M8 44c0-6 4-12 10-12h10c6 0 10 6 10 12v4H8v-4z" fill="#fca5a5" />
        <path d="M12 18c2-6 8-8 14-6s10 6 12 12" stroke="#fca5a5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M38 14c2 0 4 2 4 4v6" stroke="#fca5a5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
