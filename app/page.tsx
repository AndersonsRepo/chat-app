"use client"

import * as React from "react"
import { useRef, useEffect, useState } from "react"
import { useChat } from "ai/react"
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

// Using the Message type from the AI SDK instead of creating our own

// Function to format calendar response into a more readable format
function formatCalendarResponse(content: string, isClient: boolean): React.ReactNode {
  // Return simple content during server-side rendering to prevent hydration mismatch
  if (!isClient) {
    return <span>{content}</span>;
  }
  // Check if this is a calendar events list
  if (content.includes('events:') || content.includes('event:')) {
    // Extract the events count if available
    const eventsCountMatch = content.match(/You have (\d+) events?:/i);
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
      // Group events by day
      const eventsByDay: Record<string, ParsedEvent[]> = {};
      parsedEvents.forEach(event => {
        const dayDate = `${event.day}, ${event.date}`;
        if (!eventsByDay[dayDate]) {
          eventsByDay[dayDate] = [];
        }
        eventsByDay[dayDate].push(event);
      });
      
      return (
        <div className="space-y-4">
          {eventsCount && (
            <div className="font-medium text-indigo-700 mb-2">
              You have {eventsCount} event{parseInt(eventsCount) !== 1 ? 's' : ''} next week:
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
  return <span>{content}</span>;
}

export default function CalendarChatApp() {
  // Add a client-side only state to prevent hydration errors
  const [isClient, setIsClient] = React.useState(false);
  
  React.useEffect(() => {
    setIsClient(true);
  }, []);
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat()
  const [isCalendarLoading, setIsCalendarLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Check if the message is calendar-related
  const isCalendarQuery = (message: string) => {
    const messageLower = message.toLowerCase();
    
    // Day of week keywords
    const dayKeywords = [
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
      "mon", "tue", "wed", "thu", "fri", "sat", "sun"
    ];
    
    // Calendar-related keywords
    const calendarKeywords = [
      "schedule",
      "scheduled",
      "calendar",
      "appointment",
      "meeting",
      "event",
      "today",
      "tomorrow",
      "this week",
      "next week",
      "when do i have",
      "what do i have",
      "what about", // Catches phrases like "what about wednesday"
      "free time",
      "busy",
      "available",
    ];
    
    // Check if message contains any calendar keyword
    const hasCalendarKeyword = calendarKeywords.some(keyword => messageLower.includes(keyword.toLowerCase()));
    
    // Check if message contains any day of week
    const hasDayMention = dayKeywords.some(day => messageLower.includes(day.toLowerCase()));
    
    // Return true if message has either a calendar keyword or mentions a day
    return hasCalendarKeyword || hasDayMention;
  }

  // Update the handleCalendarQuery function to handle both array and object responses
  const handleCalendarQuery = async (query: string) => {
    setIsCalendarLoading(true)

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL as string

      // Debug logging
      console.log("Webhook URL:", webhookUrl)

      if (!webhookUrl) {
        throw new Error("NEXT_PUBLIC_WEBHOOK_URL environment variable is not set")
      }

      const requestBody = {
        sessionId: "bded18e27b064f659085802d9da651f8",
        action: "sendMessage",
        chatInput: query,
      }

      console.log("Making request to:", webhookUrl)
      console.log("Request body:", requestBody)

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      console.log("Response status:", response.status)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const rawData = await response.json()
      console.log("Response data:", rawData)

      // Handle both array and object response formats
      let calendarData: CalendarEvent

      if (Array.isArray(rawData)) {
        // If it's an array, take the first item
        calendarData = rawData[0]
      } else {
        // If it's already an object with response and success
        calendarData = rawData
      }

      if (calendarData && calendarData.success) {
        // Add calendar response as an assistant message
        const calendarMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: calendarData.response,
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
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`
                    flex items-start gap-2 max-w-[80%] 
                    ${message.role === "user" ? "flex-row-reverse" : ""}
                  `}
                  >
                    <div
                      className={`
                      p-1 rounded-full 
                      ${message.role === "user" ? "bg-blue-500" : "bg-indigo-500"}
                    `}
                    >
                      {message.role === "user" ? (
                        <User size={18} className="text-white" />
                      ) : isCalendarQuery(message.content) ? (
                        <Calendar size={18} className="text-white" />
                      ) : (
                        <Bot size={18} className="text-white" />
                      )}
                    </div>
                    <div
                      className={`
                      p-3 rounded-2xl shadow-sm
                      ${
                        message.role === "user"
                          ? "bg-blue-500 text-white rounded-tr-none"
                          : message.content.includes("event") || message.content.includes("scheduled")
                            ? "bg-indigo-100 text-indigo-800 rounded-tl-none border border-indigo-200"
                            : "bg-gray-100 text-gray-800 rounded-tl-none"
                      }
                    `}
                    >
                      {message.content.includes("event") && message.role === "assistant" ? (
                        <div className="flex items-start gap-2">
                          <Clock size={16} className="mt-1 flex-shrink-0" />
                          <div>{formatCalendarResponse(message.content, isClient)}</div>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {(isLoading || isCalendarLoading) && (
                <div className="flex justify-start">
                  <div className="flex items-start gap-2 max-w-[80%]">
                    <div className="p-1 rounded-full bg-indigo-500">
                      {isCalendarLoading ? (
                        <Calendar size={18} className="text-white" />
                      ) : (
                        <Bot size={18} className="text-white" />
                      )}
                    </div>
                    <div className="p-3 rounded-2xl shadow-sm bg-gray-100 text-gray-800 rounded-tl-none">
                      <div className="flex items-center gap-2">
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
