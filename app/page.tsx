"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { useChat, Message } from "ai/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Send, Bot, User, Calendar, Clock, CheckCircle2 } from "lucide-react"

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
                
                // Regular text
                return <div key={`line-${dayIndex}-${lineIndex}`}>{line}</div>;
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
  
  // If we couldn't parse the events or it's not a calendar response, return the original content
  return <span key="client">{content}</span>;
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-2xl shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <Calendar size={24} />
              Calendar Chat Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[60vh] p-4 bg-white">
            <div className="h-full flex items-center justify-center">
              <p>Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-2xl shadow-lg border-0">
        <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2">
            <Calendar size={24} />
            Calendar Chat Assistant
          </CardTitle>
        </CardHeader>

        <CardContent className="h-[60vh] overflow-y-auto p-4 bg-white">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 flex-col gap-4">
              <div className="flex gap-4">
                <Bot size={48} />
                <Calendar size={48} />
              </div>
              <div className="text-center">
                <p className="font-medium">Ask me anything or check your calendar!</p>
                <p className="text-sm mt-2">
                  Try: "What do I have scheduled this week?" or "What's on my calendar today?"
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col space-y-4">
              {messages.map((message: any) => {
                // Check if this is a calendar response (either by content or by having webResponse)
                const hasWebResponse = message.webResponse && typeof message.webResponse === 'string';
                const isCalendarResponse = message.role === "assistant" && 
                  (hasWebResponse || message.content.includes("events:") || message.content.includes("event:"));
                
                return (
                  <div
                    key={`${message.id}-${clientKey}`}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`relative p-3 rounded-lg ${message.role === "user" ? "bg-blue-100" : "bg-gray-100"}`}
                    >
                      <div className="flex items-start">
                        <div className="mr-2">
                          {message.role === "user" ? <User className="h-5 w-5" /> : 
                            isCalendarResponse ? <Calendar className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                        </div>
                        <div>
                          {message.role === "assistant" && isCalendarResponse
                            ? formatCalendarResponse(hasWebResponse ? message.webResponse : message.content, isClient)
                            : <span key={`content-${clientKey}`}>{message.content}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {(isLoading || isCalendarLoading) && (
                <div className="flex justify-start">
                  <div className="flex items-start">
                    <div className="mr-2">
                      {isCalendarLoading ? <Calendar className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                    </div>
                    <div className="bg-gray-100 p-3 rounded-lg">
                      <div className="flex items-center">
                        <div className="animate-pulse">●</div>
                        <div className="animate-pulse delay-100">●</div>
                        <div className="animate-pulse delay-200">●</div>
                        <span className="ml-2">{isCalendarLoading ? "Checking your calendar..." : "Thinking..."}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </CardContent>

        <CardFooter className="p-4 border-t bg-white rounded-b-lg">
          <form onSubmit={onSubmit} className="flex w-full space-x-2">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about your schedule or chat with AI..."
              className="flex-grow border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading || isCalendarLoading}
            />
            <Button
              type="submit"
              disabled={isLoading || isCalendarLoading || input.trim() === ""}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
            >
              <Send size={18} />
            </Button>
          </form>

          <div className="text-xs text-gray-500 mt-2 text-center w-full">
            Try asking: "What's my schedule today?" or "Do I have any meetings this week?"
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
