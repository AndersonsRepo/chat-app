"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { useChat, Message } from "ai/react"
import { Bot, Calendar, CheckCircle2, Clock, MessageSquare, Send, Sun, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

// Debug: Check if environment variable is available
console.log("Environment check:", {
  webhookUrl: process.env.NEXT_PUBLIC_WEBHOOK_URL,
  nodeEnv: process.env.NODE_ENV,
} as Record<string, string | undefined>)

// Update the CalendarEvent interface to match the actual response format
interface CalendarEvent {
  response: string
  success: boolean
}

// Interface for parsed calendar events
interface ParsedEvent {
  day: string
  date: string
  time: string
  title: string
  fullText: string
}

// Using the Message type from the AI SDK but extending it with our custom fields
interface ExtendedMessage extends Message {
  webResponse?: string;
}

// Function to convert URLs in text to clickable links
function convertUrlsToLinks(text: string): React.ReactNode {
  if (!text) return text;
  
  // Check for the pattern: "You can view it [here](URL)"
  const herePattern = /You can view it \[here\]\((https?:\/\/[^\)]+)\)/gi;
  let modifiedText = text;
  let matches = [];
  let match;
  
  // First handle the "You can view it [here]" pattern
  while ((match = herePattern.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      url: match[1],
      index: match.index
    });
  }
  
  // If we found "here" links, process them
  if (matches.length > 0) {
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    
    matches.forEach((match, i) => {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push(
          <span key={`text-${i}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }
      
      // Replace with "You can view it here" where "here" is a link
      const beforeLink = "You can view it ";
      result.push(
        <span key={`before-link-${i}`}>{beforeLink}</span>
      );
      
      result.push(
        <a
          key={`link-${i}`}
          href={match.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          here
        </a>
      );
      
      lastIndex = match.index + match.fullMatch.length;
    });
    
    // Add any remaining text after the last match
    if (lastIndex < text.length) {
      result.push(
        <span key={`text-${matches.length}`}>
          {text.substring(lastIndex)}
        </span>
      );
    }
    
    return <>{result}</>;
  }
  
  // Regular expression to match URLs (fallback for other URLs in the text)
  const urlRegex = /(https?:\/\/[^\s\)\]]+)/g;
  
  // Reset for the general URL handling
  matches = [];
  while ((match = urlRegex.exec(text)) !== null) {
    matches.push({
      url: match[0],
      index: match.index
    });
  }
  
  // If no URLs found, return the original text
  if (matches.length === 0) return text;
  
  // Build the result with text segments and links
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  
  matches.forEach((match, i) => {
    // Add text before the URL
    if (match.index > lastIndex) {
      result.push(
        <span key={`text-${i}`}>
          {text.substring(lastIndex, match.index)}
        </span>
      );
    }
    
    // Add the URL as a link
    result.push(
      <a
        key={`link-${i}`}
        href={match.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        here
      </a>
    );
    
    lastIndex = match.index + match.url.length;
  });
  
  // Add any remaining text after the last URL
  if (lastIndex < text.length) {
    result.push(
      <span key={`text-${matches.length}`}>
        {text.substring(lastIndex)}
      </span>
    );
  }
  
  return <>{result}</>;
}

// Function to format calendar response into a more readable format
function formatCalendarResponse(content: string, isClient: boolean): React.ReactNode {
  // Always return simple content during server-side rendering to avoid hydration issues
  if (typeof window === 'undefined' || !isClient) {
    return <span key="server-content">{content}</span>;
  }
  
  // Check if this is markdown from webResponse (starts with ** or contains line breaks)
  if (content.startsWith('**') || content.includes('\n')) {
    console.log("Detected markdown formatting in webResponse");
    
    // Split the content by line breaks
    const lines = content.split('\n');
    
    // Group lines by day headers
    const dayGroups: {[key: string]: string[]} = {};
    let currentDay = "";
    let hasTitle = false;
    
    // First line is usually the title
    if (lines.length > 0 && lines[0].startsWith('**')) {
      hasTitle = true;
    }
    
    // Process the lines
    lines.forEach((line, index) => {
      // Skip empty lines and the title (which we handle separately)
      if (!line.trim() || (index === 0 && hasTitle)) return;
      
      // Check if this is a day header (starts with ** and doesn't contain a bullet point)
      if (line.startsWith('**') && !line.includes('•') && !line.includes('events')) {
        currentDay = line.replace(/\*\*/g, '').trim();
        dayGroups[currentDay] = [];
      } else if (currentDay) {
        // Add this line to the current day group
        dayGroups[currentDay] = [...(dayGroups[currentDay] || []), line];
      } else {
        // If no day header yet, create a default group
        if (!dayGroups["Your Schedule"]) {
          dayGroups["Your Schedule"] = [];
        }
        dayGroups["Your Schedule"].push(line);
      }
    });
    
    // Get the title from the first line if it exists
    const title = hasTitle ? lines[0].replace(/\*\*/g, '').trim() : "Your Schedule";
    
    return (
      <div className="space-y-4" key="calendar-response-markdown">
        <div className="font-medium text-indigo-700 mb-2">
          <div className="flex items-center">
            <Calendar className="mr-2" size={18} />
            {title}
          </div>
        </div>
        
        {Object.entries(dayGroups).map(([day, dayLines], dayIndex) => (
          <div key={dayIndex} className="mb-3">
            <div className="font-medium text-indigo-800 border-b border-indigo-200 pb-1 mb-2">
              {day}
            </div>
            <div className="space-y-2 pl-2">
              {dayLines.map((line, lineIndex) => {
                // Format bullet points
                if (line.includes('•')) {
                  // Handle different bullet point formats
                  let timePart = "";
                  let titlePart = "";
                  
                  if (line.includes(':')) {
                    // Format: "• 9:00 AM: Meeting with team"
                    const parts = line.replace('•', '').trim().split(':');
                    timePart = parts[0] + ':' + parts[1]; // Combine hour:minute
                    titlePart = parts.slice(2).join(':'); // Everything after time
                  } else {
                    // Format: "• 9:00 AM - 10:00 AM (1 hour)"
                    timePart = line.replace('•', '').trim();
                  }
                  
                  return (
                    <div key={`event-${dayIndex}-${lineIndex}`} className="flex items-center gap-2 py-1 hover:bg-indigo-50 rounded px-1">
                      <Clock size={14} className="text-indigo-500" />
                      <span className="font-medium text-indigo-900">{timePart}</span>
                      {titlePart && <span className="text-gray-700">{titlePart.trim()}</span>}
                    </div>
                  );
                }
                
                // Format notes (italics)
                if (line.startsWith('*') && line.endsWith('*')) {
                  return (
                    <div key={`note-${dayIndex}-${lineIndex}`} className="text-gray-500 italic text-sm mt-2">
                      {line.replace(/\*/g, '')}
                    </div>
                  );
                }
                
                // Regular text - convert any URLs to clickable links
                return <div key={`line-${dayIndex}-${lineIndex}`}>{convertUrlsToLinks(line)}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // Original calendar events list parsing
  if (content.includes('events:') || content.includes('event:')) {
    // Extract the events count if available
    const eventsCountMatch = content.match(/You have (\d+) events?(?:(?:\s+(?:for|next|in)\s+)([^:]+))?:/i);
    const eventsCount = eventsCountMatch ? eventsCountMatch[1] : null;
    
    // Parse the events from the text
    const parsedEvents: ParsedEvent[] = [];
    
    // Regular expression to match event patterns like: Monday, Jun 9 at 7:00 AM: Train Laurie
    const eventRegex = /([A-Za-z]+), ([A-Za-z]+ \d+) at ([\d:]+\s*[AP]M): ([^,]+)(?:,|$)/g;
    
    let match;
    while ((match = eventRegex.exec(content)) !== null) {
      parsedEvents.push({
        day: match[1],
        date: match[2],
        time: match[3],
        title: match[4].trim(),
        fullText: match[0]
      });
    }
    
    // If we successfully parsed events, render them in a structured format
    if (parsedEvents.length > 0) {
      // Extract the header with event count if it exists
      // This regex handles both formats:
      // "You have X events for/next/in [time period]:" and "You have X events:"
      const headerMatch = content.match(/You have (\d+) events?(?:(?: (?:for|next|in) )([^:]+))?:/i);
      const eventCount = headerMatch ? headerMatch[1] : parsedEvents.length.toString();
      
      // Determine the time period from the content
      let timePeriod = "upcoming";
      const contentLower = content.toLowerCase();
      
      // Check for explicit header match first
      if (headerMatch && headerMatch[2]) {
        timePeriod = headerMatch[2];
      } 
      // Check for time periods in the content
      else {
        // First check for week-related keywords (higher priority)
        if (contentLower.includes("next week")) {
          timePeriod = "next week";
        } else if (contentLower.includes("this week")) {
          timePeriod = "this week";
        } else if (contentLower.includes("week")) {
          timePeriod = "this week";
        } else if (contentLower.includes("today")) {
          timePeriod = "today";
        } else if (contentLower.includes("tomorrow")) {
          timePeriod = "tomorrow";
        } else if (contentLower.includes("next month")) {
          timePeriod = "next month";
        } else if (contentLower.includes("this month")) {
          timePeriod = "this month";
        } else {
          // If no time period keywords found, check for month names
          const monthMap: Record<string, string> = {
            "january": "January", "jan": "January",
            "february": "February", "feb": "February",
            "march": "March", "mar": "March",
            "april": "April", "apr": "April",
            "may": "May",
            "june": "June", "jun": "June",
            "july": "July", "jul": "July",
            "august": "August", "aug": "August",
            "september": "September", "sep": "September", "sept": "September",
            "october": "October", "oct": "October",
            "november": "November", "nov": "November",
            "december": "December", "dec": "December"
          };
          
          // Find the first month mentioned in the content
          for (const [abbrev, fullName] of Object.entries(monthMap)) {
            if (contentLower.includes(abbrev)) {
              timePeriod = fullName;
              break;
            }
          }
        }
      }
      
      // Group events by day
      const eventsByDay: Record<string, ParsedEvent[]> = {};
      parsedEvents.forEach((event) => {
        const dayKey = `${event.day}, ${event.date}`;
        if (!eventsByDay[dayKey]) {
          eventsByDay[dayKey] = [];
        }
        eventsByDay[dayKey].push(event);
      });
      
      // Extract month name from the first event date if present
      let monthName = "";
      if (parsedEvents.length > 0) {
        const firstEventDate = parsedEvents[0].date; // e.g., "Dec 1"
        const monthMatch = firstEventDate.match(/([A-Za-z]+)\s+\d+/);
        if (monthMatch) {
          // Get the abbreviated month name
          const abbrevMonth = monthMatch[1]; // e.g., "Dec"
          
          // Convert abbreviated month to full month name
          const monthMap: Record<string, string> = {
            "Jan": "January",
            "Feb": "February",
            "Mar": "March",
            "Apr": "April",
            "May": "May",
            "Jun": "June",
            "Jul": "July",
            "Aug": "August",
            "Sep": "September",
            "Sept": "September",
            "Oct": "October",
            "Nov": "November",
            "Dec": "December"
          };
          
          // Use the full month name if available, otherwise use the abbreviation
          monthName = monthMap[abbrevMonth] || abbrevMonth;
        }
      }
      
      // Use the extracted month name if timePeriod is still "upcoming"
      if (timePeriod === "upcoming" && monthName) {
        timePeriod = `in ${monthName}`;
      }
      
      return (
        <div className="space-y-4">
          {eventCount && (
            <div className="font-medium text-indigo-700 mb-2">
              You have {eventCount} event{parseInt(eventCount) !== 1 ? 's' : ''} {timePeriod}:
            </div>
          )}
          
          {Object.entries(eventsByDay).map(([dayDate, events], dayIndex) => (
            <div key={dayIndex} className="mb-3">
              <div className="font-medium text-indigo-800 border-b border-indigo-200 pb-1 mb-2">
                {dayDate}
              </div>
              <div className="space-y-2 pl-2">
                {events.map((event, eventIndex) => (
                  <div key={eventIndex} className="flex items-center gap-2 py-1 hover:bg-indigo-50 rounded px-1">
                    <Clock size={14} className="text-indigo-500" />
                    <span className="font-medium text-indigo-900">{event.time}</span>
                    <span className="text-gray-700">{event.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
  }
  
  // If we couldn't parse the events or it's not a calendar response, return the original content with clickable links
  return <span key="client">{convertUrlsToLinks(content)}</span>;
}

export default function CalendarChatApp() {
  // Use a ref instead of state to avoid re-renders
  const isClientRef = useRef(false)
  const [isClient, setIsClient] = useState(false)
  const [isCalendarLoading, setIsCalendarLoading] = useState(false)
  const [messages, setMessages] = useState<ExtendedMessage[]>([])
  const [clientKey, setClientKey] = useState("")

  // Create a reference for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get chat functionality from AI SDK
  const { input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    onResponse: (response) => {
      // This is handled by the messages state we manage
    },
    onFinish: (message) => {
      // We handle message display ourselves
    },
  })

  useEffect(() => {
    isClientRef.current = true
    setIsClient(true)
    setClientKey(isClient ? 'client' : 'server')
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])
  // Ultra-simplified based on Claude Sonnet's recommendations
  const isCalendarQuery = (message: string) => {
    console.log("Checking if message is calendar query:", message);
    
    // Basic safety checks
    if (!message.trim()) {
      console.log("Empty message, not a calendar query");
      return false;
    }
    
    if (message.length > 5000) {
      console.log("Message too long, not a calendar query");
      return false;
    }
    
    // Check for extremely obvious injection attempts
    const suspiciousPatterns = [
      /<script>/i,
      /javascript:/i,
      /data:text\/html/i
    ];
    if (suspiciousPatterns.some(pattern => pattern.test(message))) {
      console.log("Suspicious pattern detected, not a calendar query");
      return false;
    }
    
    // Let ALL messages through to the n8n workflow
    // Claude Sonnet recommended removing over-filtering
    console.log("Passing message to n8n workflow:", message);
    return true;
  };

  // Update the handleCalendarQuery function to handle the updated n8n workflow structure
  const handleCalendarQuery = async (query: string) => {
    setIsCalendarLoading(true)
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL as string
      console.log("Webhook URL:", webhookUrl)
      console.log("Environment variables available:", { NEXT_PUBLIC_WEBHOOK_URL: process.env.NEXT_PUBLIC_WEBHOOK_URL })
      if (!webhookUrl) throw new Error("NEXT_PUBLIC_WEBHOOK_URL environment variable is not set")
      const requestBody = { chatInput: query }
      console.log("Sending calendar query to webhook:", requestBody)

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Calendar API returned ${response.status}: ${response.statusText}`)
      }

      const rawData = await response.json()
      console.log("Raw calendar response:", JSON.stringify(rawData, null, 2))

      let calendarData
      if (Array.isArray(rawData)) {
        // If it's an array, take the first item
        calendarData = rawData[0]?.json || rawData[0]
      } else {
        // If it's already an object
        calendarData = rawData
      }
      
      // Log specific fields we're looking for
      console.log("Calendar response fields:", {
        hasWebResponse: !!calendarData?.webResponse,
        webResponseType: typeof calendarData?.webResponse,
        webResponseLength: calendarData?.webResponse?.length,
        hasSpokenResponse: !!calendarData?.spokenResponse,
        hasMessage: !!calendarData?.message,
        hasResponse: !!calendarData?.response,
      })

      console.log("Processed calendar data:", calendarData)

      // Check for message or spokenResponse fields in the new n8n workflow format
      if (calendarData) {
        // First check for webResponse (formatted calendar display)
        const hasWebResponse = calendarData.webResponse && typeof calendarData.webResponse === 'string';
        
        // Use the most appropriate response field available for spoken/text content
        const responseContent = calendarData.spokenResponse || 
                              calendarData.message || 
                              calendarData.response || 
                              "I found your calendar information.";
        
        // Store both the spoken response and web response separately
        console.log("Using webResponse for display:", hasWebResponse);
        console.log("Display content:", calendarData.webResponse);
        console.log("Spoken content:", responseContent);

        // Add calendar response as an assistant message with both content types
        const calendarMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: responseContent,
          webResponse: hasWebResponse ? calendarData.webResponse : undefined,
          createdAt: new Date(),
        }

        setMessages((prev) => [...prev, calendarMessage])
      } else {
        throw new Error("Calendar query failed or returned no data")
      }
    } catch (error) {
      console.error("Calendar query error:", error)
      const errorMessage = {
        id: Date.now().toString(),
        role: "assistant" as const,
        content: `Sorry, I couldn't retrieve your calendar information. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsCalendarLoading(false)
    }
  }

  // Custom submit handler
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!input.trim()) return

    // Store the current input before clearing it
    const currentInput = input

    // Clear input immediately to prevent double submissions
    handleInputChange({ target: { value: "" } } as any)

    // Check if it's a calendar query
    if (isCalendarQuery(currentInput)) {
      // Add user message immediately
      const userMessage = {
        id: Date.now().toString(),
        role: "user" as const,
        content: currentInput,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
      
      // Process calendar query
      await handleCalendarQuery(currentInput)
    } else {
      // For non-calendar queries, let the useChat hook handle everything
      // This prevents duplicate messages
      handleSubmit(e, { data: { input: currentInput } })
    }
  }

  // Use a simple loading state during server-side rendering
  if (!isClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-mist-gray to-whisper-white p-4">
        <Card className="w-full max-w-2xl shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-[hsl(var(--calm-navy))] to-[hsl(var(--warm-graphite))] text-white rounded-t-xl">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-heading">
                <Bot className="h-6 w-6" />
                <span>Clarity</span>
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="text-xs opacity-80">
                  {new Date().toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[60vh] p-6 bg-white">
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 bg-[hsl(var(--calm-navy)/0.2)] rounded-full animate-ping"></div>
                  <div className="relative flex items-center justify-center w-16 h-16 bg-[hsl(var(--calm-navy)/0.3)] rounded-full">
                    <Calendar className="h-8 w-8 text-[hsl(var(--calm-navy))]" />
                  </div>
                </div>
                <p className="text-lg font-medium text-[hsl(var(--calm-navy))]">Loading your clarity assistant...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get current time for greeting
  const getCurrentGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // Get current date formatted nicely
  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short', 
    day: 'numeric'
  });

  // Sample quick actions for the empty state
  const quickActions = [
    { 
      icon: <Calendar className="h-5 w-5 group-hover:scale-110 transition-transform" />,
      text: "Own Today",
      query: "What's on my calendar today?"
    },
    { 
      icon: <Clock className="h-5 w-5 group-hover:scale-110 transition-transform" />,
      text: "See What's Coming",
      query: "Do I have any meetings this week?"
    },
    { 
      icon: <CheckCircle2 className="h-5 w-5 group-hover:scale-110 transition-transform" />,
      text: "Free Up Time",
      query: "Can you help me reschedule my least important meetings?"
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-mist-gray to-whisper-white p-4">
      <Card className="w-full max-w-2xl shadow-xl border-0 rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[hsl(var(--calm-navy))] to-[hsl(var(--warm-graphite))] text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-6 w-6" />
              <span className="font-heading">Clarity</span>
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="text-xs opacity-80">
                {formattedDate}
              </div>
              <button className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <Sun className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="h-[60vh] overflow-y-auto p-6 bg-white">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center flex-col gap-6">
              <div className="text-center max-w-xs">
                <h2 className="font-heading text-2xl font-bold text-[hsl(var(--calm-navy))] mb-1">Turn Chaos Into Calm</h2>
                <p className="text-sm text-gray-600 mb-5">This isn't just a schedule. It's your day, under control.</p>
                
                <div className="space-y-3">
                  {quickActions.map((action, index) => (
                    <button 
                      key={index}
                      className="button-primary py-3 px-5 w-full flex items-center justify-center gap-2 group"
                      onClick={() => handleInputChange({ target: { value: action.query } } as any)}
                    >
                      {action.icon}
                      <span>{action.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col space-y-6">
              {messages.map((message: any) => {
                // Check if this is a calendar response (either by content or by having webResponse)
                const hasWebResponse = message.webResponse && typeof message.webResponse === 'string';
                const isCalendarResponse = message.role === "assistant" && 
                  (hasWebResponse || message.content.includes("events:") || message.content.includes("event:"));
                
                return (
                  <div
                    key={`${message.id}-${clientKey}`}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} w-full`}
                  >
                    {message.role !== "user" && (
                      <div className="flex-shrink-0 mr-3 mt-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--calm-navy))] to-[hsl(var(--warm-graphite))] flex items-center justify-center">
                          {isCalendarResponse ? 
                            <Calendar className="h-4 w-4 text-white" /> : 
                            <Bot className="h-4 w-4 text-white" />}
                        </div>
                      </div>
                    )}
                    
                    <div
                      className={`relative max-w-[85%] p-4 ${message.role === "user" 
                        ? "chat-bubble-user" 
                        : isCalendarResponse 
                          ? "chat-bubble-calendar" 
                          : "chat-bubble-assistant"}`}
                    >
                      <div>
                        {message.role === "assistant" && isCalendarResponse
                          ? formatCalendarResponse(hasWebResponse ? message.webResponse : message.content, isClient)
                          : <span key={`content-${clientKey}`} className="text-[15px] leading-relaxed">{message.content}</span>}
                      </div>
                      
                      {/* Timestamp */}
                      <div className={`text-[10px] mt-1 opacity-70 ${message.role === "user" ? "text-right text-white" : "text-left text-gray-500"}`}>
                        {new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    
                    {message.role === "user" && (
                      <div className="flex-shrink-0 ml-3 mt-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--calm-navy))] to-[hsl(var(--warm-graphite))] flex items-center justify-center">
                          <User className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {(isLoading || isCalendarLoading) && (
                <div className="flex justify-start w-full">
                  <div className="flex-shrink-0 mr-3 mt-1">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--calm-navy))] to-[hsl(var(--warm-graphite))] flex items-center justify-center">
                      {isCalendarLoading ? 
                        <Calendar className="h-4 w-4 text-white" /> : 
                        <Bot className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                  <div className="chat-bubble-assistant py-3 px-4">
                    <div className="flex items-center">
                      <div className="flex space-x-1 mr-3">
                        <span className="animate-pulse-dot h-2 w-2 rounded-full bg-[hsl(var(--calm-navy))]" style={{"--delay": "0"} as React.CSSProperties}>●</span>
                        <span className="animate-pulse-dot h-2 w-2 rounded-full bg-[hsl(var(--calm-navy))]" style={{"--delay": "1"} as React.CSSProperties}>●</span>
                        <span className="animate-pulse-dot h-2 w-2 rounded-full bg-[hsl(var(--calm-navy))]" style={{"--delay": "2"} as React.CSSProperties}>●</span>
                      </div>
                      <span className="text-sm font-medium">
                        {isCalendarLoading ? "Checking your calendar..." : "Thinking..."}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </CardContent>

        <CardFooter className="p-5 border-t bg-white rounded-b-xl">
          <div className="w-full">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-medium text-[hsl(var(--calm-navy))]">Your Assistant is Listening</p>
              <p className="text-xs text-gray-500">{getCurrentGreeting()}</p>
            </div>
            
            <form onSubmit={onSubmit} className="flex w-full space-x-3">
              <div className="relative flex-grow">
                <Input
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask anything about your schedule..."
                  className="input-modern flex-grow py-6 pl-4 pr-10 text-base"
                  disabled={isLoading || isCalendarLoading}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-[hsl(var(--calm-navy))] cursor-pointer transition-colors">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading || isCalendarLoading || input.trim() === ""}
                className="button-primary aspect-square p-3 transition-transform hover:scale-105"
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
